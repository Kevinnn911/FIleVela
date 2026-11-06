// File: src/app/api/compress/route.ts

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { verifyFileMime } from "@/lib/security/mime-detector";
import {
  checkRateLimit,
  logSecurityEvent,
  sanitizePublicErrorMessage,
} from "@/lib/security/rate-limiter";
import { generateOwnerToken } from "@/lib/security/token-auth";
import {
  compressFileBuffer,
  CompressionLevel,
  isSupportedCompressionFormat,
} from "@/lib/compression/file-compressor";
import {
  getJobDir,
  initJobDirectory,
  JobMetadata,
  saveInputFile,
  writeJobMeta,
} from "@/lib/storage/temp-storage";
import { resolveSafePath, sanitizeFilename } from "@/lib/storage/path-sanitizer";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, {
    bucket: "compress-create",
    maxRequests: 45,
    windowMs: 60 * 1000,
  });

  if (!rateLimit.allowed) {
    logSecurityEvent({
      type: "rate_limit_exceeded",
      route: "/api/compress",
      reason: "Compression rate limit exceeded",
    });
    return NextResponse.json(
      {
        error: "Terlalu banyak permintaan kompresi.",
        code: "RATE_LIMIT_EXCEEDED",
        message: "Silakan tunggu beberapa saat sebelum mengompresi berkas berikutnya.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": rateLimit.retryAfterSeconds.toString(),
        },
      }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const levelParam = (formData.get("level") as string) || "recommended";

    if (!file || typeof file === "string" || !(file instanceof Blob)) {
      return NextResponse.json(
        {
          error: "Berkas tidak ditemukan.",
          code: "MISSING_FILE",
          message: "Harap lampirkan berkas yang ingin dikompresi.",
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

    const level: CompressionLevel =
      levelParam === "low" || levelParam === "extreme"
        ? levelParam
        : "recommended";

    const originalFilename = file.name || "uploaded_file";
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const declaredExt =
      path.extname(originalFilename).replace(/^\.+/, "") || file.type || "";
    const mimeVerification = verifyFileMime(fileBuffer, declaredExt);

    if (!mimeVerification.valid || !mimeVerification.detectedFormat) {
      return NextResponse.json(
        {
          error: "Format berkas tidak dikenali.",
          code: "UNRECOGNIZED_MIME_SIGNATURE",
          message: "Format konten berkas tidak valid atau belum didukung.",
        },
        { status: 400 }
      );
    }

    const detectedFormat = mimeVerification.detectedFormat;
    const detectedMime =
      mimeVerification.detectedMime || "application/octet-stream";

    if (!isSupportedCompressionFormat(detectedFormat)) {
      return NextResponse.json(
        {
          error: "Format belum didukung untuk kompresi langsung.",
          code: "UNSUPPORTED_COMPRESSION_FORMAT",
          message: `Format .${detectedFormat.toUpperCase()} tidak dapat dikompresi secara langsung. Gunakan gambar, PDF, dokumen OpenXML (.docx/.pptx/.xlsx/.odt), arsip ZIP, media video/audio, atau berkas teks/data.`,
        },
        { status: 400 }
      );
    }

    const compResult = await compressFileBuffer(
      fileBuffer,
      detectedFormat,
      detectedMime,
      level
    );

    const jobId = crypto.randomUUID();
    const { token, hash } = generateOwnerToken();
    await initJobDirectory(jobId);

    const safeOriginal = sanitizeFilename(originalFilename);
    const ext = path.extname(safeOriginal) || `.${detectedFormat}`;
    const base = path.basename(safeOriginal, path.extname(safeOriginal));
    const outputFilename = `${base}_compressed${ext}`;

    await saveInputFile(jobId, safeOriginal, fileBuffer);

    const jobDir = getJobDir(jobId);
    const outputPath = resolveSafePath(jobDir, path.join("output", outputFilename));
    await fs.promises.writeFile(outputPath, compResult.compressedBuffer);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

    const jobMeta: JobMetadata = {
      jobId,
      ownerTokenHash: hash,
      status: "succeeded",
      sourceFormat: detectedFormat,
      targetFormat: detectedFormat,
      originalFilename: safeOriginal,
      inputFilename: safeOriginal,
      outputFilename,
      inputSizeBytes: compResult.originalSizeBytes,
      outputSizeBytes: compResult.compressedSizeBytes,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      metadata: {
        savedBytes: compResult.savedBytes,
        savedPercentage: compResult.savedPercentage,
        compressionLevel: level,
        durationMs: compResult.durationMs,
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
    const err = error as Error;
    const safeMsg = sanitizePublicErrorMessage(
      err?.message,
      "Terjadi kesalahan internal saat kompresi berkas."
    );
    return NextResponse.json(
      {
        error: "Gagal memproses kompresi berkas.",
        code: "COMPRESSION_ERROR",
        message: safeMsg,
      },
      { status: 500 }
    );
  }
}
