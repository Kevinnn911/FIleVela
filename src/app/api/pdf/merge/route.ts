// File: src/app/api/pdf/merge/route.ts

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { verifyFileMime } from "@/lib/security/mime-detector";
import { generateOwnerToken } from "@/lib/security/token-auth";
import {
  mergePdfBuffers,
  getPdfPageCount,
  PdfValidationError,
} from "@/lib/document/pdf-tools";
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

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB per file
const MAX_TOTAL_AGGREGATE_BYTES = 250 * 1024 * 1024; // 250 MB total batch
const MAX_TOTAL_FILES = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, {
    bucket: "api:pdf-merge",
    maxRequests: 25,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    logSecurityEvent({
      type: "rate_limit_exceeded",
      route: "/api/pdf/merge",
      clientIp: extractClientIp(request),
      reason: "Melebihi kuota penggabungan PDF per menit.",
    });
    return NextResponse.json(
      {
        error: "Terlalu banyak permintaan.",
        code: "RATE_LIMIT_EXCEEDED",
        message: "Batas penggabungan PDF terlampaui. Silakan coba lagi sesaat lagi.",
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
    const rawFiles = formData.getAll("files");

    if (!rawFiles || rawFiles.length < 2) {
      return NextResponse.json(
        {
          error: "Jumlah berkas kurang.",
          code: "INSUFFICIENT_FILES",
          message: "Harap pilih minimal 2 berkas PDF untuk digabungkan.",
        },
        { status: 400 }
      );
    }

    if (rawFiles.length > MAX_TOTAL_FILES) {
      return NextResponse.json(
        {
          error: "Terlalu banyak berkas.",
          code: "TOO_MANY_FILES",
          message: `Maksimal berkas yang dapat digabungkan sekaligus adalah ${MAX_TOTAL_FILES} berkas.`,
        },
        { status: 400 }
      );
    }

    const pdfBuffers: Buffer[] = [];
    const filenames: string[] = [];
    let totalInputSizeBytes = 0;

    for (let i = 0; i < rawFiles.length; i++) {
      const file = rawFiles[i];
      if (!file || typeof file === "string" || !(file instanceof Blob)) {
        continue;
      }

      if (file.size === 0) {
        return NextResponse.json(
          {
            error: "Berkas kosong.",
            code: "EMPTY_FILE",
            message: `Berkas ke-${i + 1} (${file.name || "PDF"}) kosong (0 byte).`,
          },
          { status: 400 }
        );
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          {
            error: "Ukuran berkas melebihi batas.",
            code: "FILE_TOO_LARGE",
            message: `Berkas "${file.name}" melebihi batas maksimum 50 MB.`,
          },
          { status: 400 }
        );
      }

      totalInputSizeBytes += file.size;
      if (totalInputSizeBytes > MAX_TOTAL_AGGREGATE_BYTES) {
        return NextResponse.json(
          {
            error: "Total ukuran seluruh berkas melebihi batas.",
            code: "BATCH_TOO_LARGE",
            message: `Total ukuran gabungan maksimum adalah ${
              MAX_TOTAL_AGGREGATE_BYTES / (1024 * 1024)
            } MB.`,
          },
          { status: 400 }
        );
      }

      const buf = Buffer.from(await file.arrayBuffer());
      const mimeCheck = verifyFileMime(buf, "pdf");
      if (!mimeCheck.valid || mimeCheck.detectedFormat !== "pdf") {
        return NextResponse.json(
          {
            error: "Format bukan PDF.",
            code: "INVALID_PDF_FORMAT",
            message: `Berkas "${file.name}" bukan berkas PDF yang valid.`,
          },
          { status: 400 }
        );
      }

      pdfBuffers.push(buf);
      filenames.push(sanitizeFilename(file.name || `dokumen_${i + 1}.pdf`));
    }

    if (pdfBuffers.length < 2 || !pdfBuffers[0] || !filenames[0]) {
      return NextResponse.json(
        {
          error: "Berkas PDF tidak valid.",
          code: "INSUFFICIENT_VALID_FILES",
          message: "Dibutuhkan minimal 2 berkas PDF yang valid untuk digabung.",
        },
        { status: 400 }
      );
    }

    const mergedBuffer = await mergePdfBuffers(pdfBuffers);
    const totalPages = await getPdfPageCount(mergedBuffer);

    const jobId = crypto.randomUUID();
    const { token, hash } = generateOwnerToken();
    await initJobDirectory(jobId);

    const primaryFilename = filenames[0];
    const primaryBuffer = pdfBuffers[0];
    await saveInputFile(jobId, primaryFilename, primaryBuffer);

    const outputFilename = `fileflow_gabungan_${Date.now()}.pdf`;
    const jobDir = getJobDir(jobId);
    const outputPath = resolveSafePath(jobDir, path.join("output", outputFilename));
    await fs.promises.writeFile(outputPath, mergedBuffer);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

    const jobMeta: JobMetadata = {
      jobId,
      ownerTokenHash: hash,
      status: "succeeded",
      sourceFormat: "pdf",
      targetFormat: "pdf",
      originalFilename: `Kombinasi_${filenames.length}_Berkas_PDF`,
      inputFilename: primaryFilename,
      outputFilename,
      inputSizeBytes: totalInputSizeBytes,
      outputSizeBytes: mergedBuffer.length,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      metadata: {
        mergedFilesCount: filenames.length,
        mergedFilenames: filenames,
        totalPages,
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
      "Terjadi kesalahan internal saat penggabungan PDF."
    );
    return NextResponse.json(
      {
        error: "Gagal menggabungkan berkas PDF.",
        code: "PDF_MERGE_ERROR",
        message: safeMessage,
      },
      { status: 500 }
    );
  }
}
