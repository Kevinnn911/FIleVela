// File: src/app/api/pdf/split/route.ts

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { verifyFileMime } from "@/lib/security/mime-detector";
import { generateOwnerToken } from "@/lib/security/token-auth";
import {
  splitPdfBuffer,
  SplitPdfOptions,
  PdfValidationError,
} from "@/lib/document/pdf-tools";
import { ZipWriter } from "@/lib/document/zip-writer";
import {
  getJobDir,
  initJobDirectory,
  JobMetadata,
  saveInputFile,
  writeJobMeta,
} from "@/lib/storage/temp-storage";
import { resolveSafePath, sanitizeFilename } from "@/lib/storage/path-sanitizer";
import {
  checkRateLimit,
  extractClientIp,
  logSecurityEvent,
  sanitizePublicErrorMessage,
} from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, {
    bucket: "api:pdf-split",
    maxRequests: 25,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    logSecurityEvent({
      type: "rate_limit_exceeded",
      route: "/api/pdf/split",
      clientIp: extractClientIp(request),
      reason: "Melebihi kuota pemisahan PDF per menit.",
    });
    return NextResponse.json(
      {
        error: "Terlalu banyak permintaan.",
        code: "RATE_LIMIT_EXCEEDED",
        message: "Batas pemisahan PDF terlampaui. Silakan coba lagi sesaat lagi.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const modeParam = formData.get("mode") as string | null;
    const rangeParam = formData.get("range") as string | null;

    if (!file || typeof file === "string" || !(file instanceof Blob)) {
      return NextResponse.json(
        {
          error: "Berkas tidak ditemukan.",
          code: "MISSING_FILE",
          message: "Harap lampirkan berkas PDF yang ingin dipisah.",
        },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        {
          error: "Berkas kosong.",
          code: "EMPTY_FILE",
          message: "Berkas berukuran 0 byte tidak dapat diproses.",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: "Ukuran berkas melebihi batas.",
          code: "FILE_TOO_LARGE",
          message: `Ukuran maksimum berkas adalah ${
            MAX_FILE_SIZE_BYTES / (1024 * 1024)
          } MB.`,
        },
        { status: 400 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const mimeCheck = verifyFileMime(fileBuffer, "pdf");
    if (!mimeCheck.valid || mimeCheck.detectedFormat !== "pdf") {
      return NextResponse.json(
        {
          error: "Format bukan PDF.",
          code: "INVALID_PDF_FORMAT",
          message: "Berkas yang diunggah bukan format PDF yang valid.",
        },
        { status: 400 }
      );
    }

    const splitOptions: SplitPdfOptions = {
      mode: modeParam === "range" ? "range" : "all",
      range: rangeParam || undefined,
    };

    const originalFilename = sanitizeFilename(file.name || "document.pdf");
    const baseName = path.basename(originalFilename, path.extname(originalFilename));

    const splitResults = await splitPdfBuffer(fileBuffer, splitOptions, baseName);

    if (splitResults.length === 0) {
      return NextResponse.json(
        {
          error: "Gagal memisahkan PDF.",
          code: "NO_PAGES_EXTRACTED",
          message: "Tidak ada halaman yang berhasil dipisahkan.",
        },
        { status: 400 }
      );
    }

    const jobId = crypto.randomUUID();
    const { token, hash } = generateOwnerToken();
    await initJobDirectory(jobId);

    await saveInputFile(jobId, originalFilename, fileBuffer);
    const jobDir = getJobDir(jobId);

    let outputFilename: string;
    let finalBuffer: Buffer;
    let targetFormat: string;

    if (splitResults.length === 1 && splitResults[0]) {
      outputFilename = splitResults[0].filename;
      finalBuffer = splitResults[0].buffer;
      targetFormat = "pdf";
    } else {
      const zipWriter = new ZipWriter();
      for (const res of splitResults) {
        zipWriter.addFile(res.filename, res.buffer, false);
      }
      outputFilename = `${baseName}_pisah_halaman.zip`;
      finalBuffer = zipWriter.toBuffer();
      targetFormat = "zip";
    }

    const outputPath = resolveSafePath(jobDir, path.join("output", outputFilename));
    await fs.promises.writeFile(outputPath, finalBuffer);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

    const jobMeta: JobMetadata = {
      jobId,
      ownerTokenHash: hash,
      status: "succeeded",
      sourceFormat: "pdf",
      targetFormat,
      originalFilename,
      inputFilename: originalFilename,
      outputFilename,
      inputSizeBytes: fileBuffer.length,
      outputSizeBytes: finalBuffer.length,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      metadata: {
        splitMode: splitOptions.mode,
        splitRange: splitOptions.range,
        extractedCount: splitResults.length,
      },
    };

    await writeJobMeta(jobId, jobMeta);

    return NextResponse.json(
      {
        status: "succeeded",
        job: {
          ...jobMeta,
          id: jobId,
          downloadUrl: `/api/jobs/${jobId}/download?token=${token}`,
        },
        ownerToken: token,
        downloadUrl: `/api/jobs/${jobId}/download?token=${token}`,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof PdfValidationError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          message: error.message,
        },
        { status: 400 }
      );
    }

    const err = error as Error;
    const safeMessage = sanitizePublicErrorMessage(
      err.message,
      "Terjadi kesalahan internal saat pemisahan PDF."
    );
    return NextResponse.json(
      {
        error: "Gagal memisahkan berkas PDF.",
        code: "PDF_SPLIT_ERROR",
        message: safeMessage,
      },
      { status: 500 }
    );
  }
}
