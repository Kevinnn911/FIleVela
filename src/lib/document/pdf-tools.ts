// File: src/lib/document/pdf-tools.ts

import { PDFDocument } from "pdf-lib";

export interface SplitPdfOptions {
  mode: "all" | "range";
  range?: string;
}

export interface SplitPdfResult {
  filename: string;
  buffer: Buffer;
  pageCount: number;
}

export class PdfValidationError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "PdfValidationError";
    this.code = code;
    Object.setPrototypeOf(this, PdfValidationError.prototype);
  }
}

async function loadUnlockedPdfDocument(
  pdfBuffer: Buffer,
  fileLabel?: string
): Promise<PDFDocument> {
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new PdfValidationError(
      "EMPTY_PDF",
      fileLabel
        ? `Berkas ${fileLabel} kosong atau tidak valid.`
        : "Berkas PDF kosong atau tidak valid."
    );
  }

  const headAscii = pdfBuffer.subarray(0, 1024).toString("latin1");
  if (!headAscii.includes("%PDF-")) {
    throw new PdfValidationError(
      "INVALID_PDF_FORMAT",
      fileLabel
        ? `Berkas ${fileLabel} bukan dokumen PDF yang valid.`
        : "Berkas bukan dokumen PDF yang valid."
    );
  }

  try {
    const doc = await PDFDocument.load(pdfBuffer);
    // Eagerly resolve Catalog /Pages tree so malformed stubs fail inside PdfValidationError
    const pageCount = doc.getPageCount();
    if (pageCount > 0) {
      doc.getPages();
    }
    return doc;
  } catch (err) {
    if (err instanceof PdfValidationError) {
      throw err;
    }
    const rawMsg = err instanceof Error ? err.message : String(err);
    if (/encrypt/i.test(rawMsg)) {
      throw new PdfValidationError(
        "ENCRYPTED_PDF",
        fileLabel
          ? `Berkas ${fileLabel} dilindungi kata sandi (terenkripsi). Harap buka proteksi PDF terlebih dahulu.`
          : "Berkas PDF dilindungi kata sandi (terenkripsi). Harap buka proteksi PDF terlebih dahulu."
      );
    }
    throw new PdfValidationError(
      "CORRUPT_PDF",
      fileLabel
        ? `Gagal memuat ${fileLabel}: struktur PDF rusak atau tidak lengkap.`
        : `Gagal memuat dokumen PDF: struktur PDF rusak atau tidak lengkap (${rawMsg}).`
    );
  }
}

/**
 * Returns the total number of pages in a PDF buffer.
 */
export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const doc = await loadUnlockedPdfDocument(pdfBuffer);
  return doc.getPageCount();
}

/**
 * Merges multiple PDF buffers into a single PDF document in the provided order.
 */
export async function mergePdfBuffers(pdfBuffers: Buffer[]): Promise<Buffer> {
  if (!pdfBuffers || pdfBuffers.length < 2) {
    throw new PdfValidationError(
      "INSUFFICIENT_FILES",
      "Penggabungan PDF membutuhkan minimal 2 berkas PDF."
    );
  }

  const mergedDoc = await PDFDocument.create();

  for (let i = 0; i < pdfBuffers.length; i++) {
    const buf = pdfBuffers[i];
    if (!buf || buf.length === 0) {
      throw new PdfValidationError(
        "EMPTY_PDF",
        `Berkas PDF ke-${i + 1} kosong.`
      );
    }

    const srcDoc = await loadUnlockedPdfDocument(buf, `PDF ke-${i + 1}`);
    const pageIndices = srcDoc.getPageIndices();
    if (pageIndices.length === 0) {
      throw new PdfValidationError(
        "EMPTY_PDF",
        `Berkas PDF ke-${i + 1} tidak memiliki halaman.`
      );
    }

    try {
      const copiedPages = await mergedDoc.copyPages(srcDoc, pageIndices);
      for (const page of copiedPages) {
        mergedDoc.addPage(page);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new PdfValidationError(
        "CORRUPT_PDF",
        `Gagal menyalin halaman dari PDF ke-${i + 1}: ${msg}`
      );
    }
  }

  const mergedBytes = await mergedDoc.save({ useObjectStreams: true });
  return Buffer.from(mergedBytes);
}

/**
 * Parses a page range string such as "1-3, 5, 8-10" into 0-based unique page indices.
 * Validates that indices are within the valid page count [0, totalPages - 1].
 */
export function parsePageRange(rangeStr: string, totalPages: number): number[] {
  if (!rangeStr || rangeStr.trim().length === 0) {
    throw new PdfValidationError(
      "INVALID_PAGE_RANGE",
      "Rentang halaman tidak boleh kosong."
    );
  }

  const indicesSet = new Set<number>();
  const parts = rangeStr
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (part.includes("-")) {
      const bounds = part.split("-").map((b) => b.trim());
      if (
        bounds.length !== 2 ||
        !/^\d+$/.test(bounds[0] || "") ||
        !/^\d+$/.test(bounds[1] || "")
      ) {
        throw new PdfValidationError(
          "INVALID_PAGE_RANGE",
          `Sintaks rentang halaman "${part}" tidak valid.`
        );
      }

      const start = parseInt(bounds[0] || "", 10);
      const end = parseInt(bounds[1] || "", 10);

      if (Number.isNaN(start) || Number.isNaN(end) || start < 1 || end < start) {
        throw new PdfValidationError(
          "INVALID_PAGE_RANGE",
          `Rentang halaman "${part}" tidak valid.`
        );
      }

      for (let p = start; p <= end; p++) {
        if (p > totalPages) {
          throw new PdfValidationError(
            "PAGE_OUT_OF_BOUNDS",
            `Halaman ${p} melebihi jumlah halaman total dokumen (${totalPages} halaman).`
          );
        }
        indicesSet.add(p - 1);
      }
    } else {
      if (!/^\d+$/.test(part)) {
        throw new PdfValidationError(
          "INVALID_PAGE_RANGE",
          `Nomor halaman "${part}" tidak valid.`
        );
      }
      const pageNum = parseInt(part, 10);
      if (Number.isNaN(pageNum) || pageNum < 1) {
        throw new PdfValidationError(
          "INVALID_PAGE_RANGE",
          `Nomor halaman "${part}" tidak valid.`
        );
      }
      if (pageNum > totalPages) {
        throw new PdfValidationError(
          "PAGE_OUT_OF_BOUNDS",
          `Halaman ${pageNum} melebihi jumlah halaman total dokumen (${totalPages} halaman).`
        );
      }
      indicesSet.add(pageNum - 1);
    }
  }

  const sortedIndices = Array.from(indicesSet).sort((a, b) => a - b);
  if (sortedIndices.length === 0) {
    throw new PdfValidationError(
      "INVALID_PAGE_RANGE",
      "Tidak ada halaman yang dipilih dari rentang yang ditentukan."
    );
  }

  return sortedIndices;
}

/**
 * Splits a PDF document into multiple PDF documents according to mode.
 */
export async function splitPdfBuffer(
  pdfBuffer: Buffer,
  options: SplitPdfOptions,
  baseFilename: string = "document"
): Promise<SplitPdfResult[]> {
  const srcDoc = await loadUnlockedPdfDocument(pdfBuffer);
  const totalPages = srcDoc.getPageCount();

  if (totalPages === 0) {
    throw new PdfValidationError(
      "EMPTY_PDF",
      "Dokumen PDF tidak memiliki halaman."
    );
  }

  const cleanBase = baseFilename.replace(/\.pdf$/i, "");
  const results: SplitPdfResult[] = [];

  if (options.mode === "all") {
    for (let i = 0; i < totalPages; i++) {
      const singlePageDoc = await PDFDocument.create();
      const [copiedPage] = await singlePageDoc.copyPages(srcDoc, [i]);
      if (copiedPage) {
        singlePageDoc.addPage(copiedPage);
      }

      const bytes = await singlePageDoc.save({ useObjectStreams: true });
      const pageNumberFormatted = String(i + 1).padStart(
        totalPages >= 100 ? 3 : totalPages >= 10 ? 2 : 1,
        "0"
      );
      results.push({
        filename: `${cleanBase}_halaman_${pageNumberFormatted}.pdf`,
        buffer: Buffer.from(bytes),
        pageCount: 1,
      });
    }
  } else if (options.mode === "range") {
    if (!options.range || options.range.trim().length === 0) {
      throw new PdfValidationError(
        "INVALID_PAGE_RANGE",
        "Parameter rentang halaman wajib diisi untuk mode split range."
      );
    }

    const indices = parsePageRange(options.range, totalPages);
    const rangeDoc = await PDFDocument.create();
    const copiedPages = await rangeDoc.copyPages(srcDoc, indices);

    for (const page of copiedPages) {
      rangeDoc.addPage(page);
    }

    const bytes = await rangeDoc.save({ useObjectStreams: true });
    const sanitizedRangeSlug =
      options.range.replace(/[^0-9,-]/g, "").replace(/,/g, "_") || "pilihan";
    results.push({
      filename: `${cleanBase}_hal_${sanitizedRangeSlug}.pdf`,
      buffer: Buffer.from(bytes),
      pageCount: indices.length,
    });
  } else {
    throw new PdfValidationError(
      "UNSUPPORTED_SPLIT_MODE",
      `Mode split "${options.mode}" tidak didukung.`
    );
  }

  return results;
}
