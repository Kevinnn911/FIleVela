// File: src/app/api/jobs/batch-zip/route.ts

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { isValidJobId, resolveSafePath, sanitizeFilename } from "@/lib/storage/path-sanitizer";
import {
  checkRateLimit,
  logSecurityEvent,
  sanitizePublicErrorMessage,
} from "@/lib/security/rate-limiter";
import { generateOwnerToken, verifyOwnerToken } from "@/lib/security/token-auth";
import {
  deleteJobDirectory,
  getJobDir,
  getJobOutputFilePath,
  initJobDirectory,
  isJobExpired,
  JobMetadata,
  readJobMeta,
  writeJobMeta,
} from "@/lib/storage/temp-storage";
import { ZipWriter } from "@/lib/document/zip-writer";

export const dynamic = "force-dynamic";

interface BatchItemRequest {
  jobId: string;
  token: string;
}

const PRECOMPRESSED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".gif",
  ".mp4",
  ".webm",
  ".mp3",
  ".aac",
  ".m4a",
  ".flac",
  ".ogg",
  ".docx",
  ".pptx",
  ".xlsx",
  ".odt",
  ".zip",
  ".pdf",
]);

const MAX_BATCH_ITEMS = 100;
const MAX_BATCH_ZIP_BYTES = 250 * 1024 * 1024; // 250 MB

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, {
    bucket: "batch-zip",
    maxRequests: 25,
    windowMs: 60 * 1000,
  });

  if (!rateLimit.allowed) {
    logSecurityEvent({
      type: "rate_limit_exceeded",
      route: "/api/jobs/batch-zip",
      reason: "Batch ZIP rate limit exceeded",
    });
    return NextResponse.json(
      {
        error: "Terlalu banyak permintaan pengemasan ZIP.",
        code: "RATE_LIMIT_EXCEEDED",
        message: "Silakan tunggu beberapa saat sebelum membuat arsip ZIP kembali.",
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
    const body = await request.json();
    const items: BatchItemRequest[] = body.items;
    const requestedZipName: string =
      typeof body.zipFilename === "string" && body.zipFilename.trim().length > 0
        ? sanitizeFilename(body.zipFilename.trim(), `fileflow_batch_${Date.now()}`)
        : `fileflow_batch_${Date.now()}.zip`;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        {
          error: "Daftar pekerjaan kosong.",
          code: "EMPTY_BATCH_ITEMS",
          message: "Harap sertakan minimal 1 berkas hasil pekerjaan untuk diunduh sebagai ZIP.",
        },
        { status: 400 }
      );
    }

    if (items.length > MAX_BATCH_ITEMS) {
      return NextResponse.json(
        {
          error: "Jumlah berkas melebihi batas.",
          code: "TOO_MANY_BATCH_ITEMS",
          message: `Maksimum berkas yang dapat dikemas sekaligus adalah ${MAX_BATCH_ITEMS} berkas.`,
        },
        { status: 400 }
      );
    }

    const zipWriter = new ZipWriter();
    const usedFilenames = new Map<string, number>();
    let totalOutputBytes = 0;
    let includedCount = 0;

    for (const item of items) {
      if (!item.jobId || !isValidJobId(item.jobId) || !item.token) {
        continue;
      }

      const meta = await readJobMeta(item.jobId);
      if (!meta || meta.status !== "succeeded") {
        continue;
      }

      const isOwner = verifyOwnerToken(item.token, meta.ownerTokenHash);
      if (!isOwner) {
        continue;
      }

      if (isJobExpired(meta)) {
        await deleteJobDirectory(item.jobId);
        continue;
      }

      const outPath = await getJobOutputFilePath(item.jobId);
      if (!outPath || !fs.existsSync(outPath)) {
        continue;
      }

      const fileBuffer = await fs.promises.readFile(outPath);
      if (totalOutputBytes + fileBuffer.length > MAX_BATCH_ZIP_BYTES) {
        return NextResponse.json(
          {
            error: "Ukuran total arsip ZIP melebihi batas maksimum.",
            code: "BATCH_ZIP_TOO_LARGE",
            message: "Total ukuran gabungan berkas dalam arsip ZIP melebihi batas 250 MB.",
          },
          { status: 400 }
        );
      }
      let filename = meta.outputFilename || `hasil_${item.jobId}.${meta.targetFormat}`;

      if (usedFilenames.has(filename)) {
        const count = (usedFilenames.get(filename) || 1) + 1;
        usedFilenames.set(filename, count);
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        filename = `${base}_${count}${ext}`;
      } else {
        usedFilenames.set(filename, 1);
      }

      const extLower = path.extname(filename).toLowerCase();
      const shouldDeflate = !PRECOMPRESSED_EXTENSIONS.has(extLower);

      zipWriter.addFile(filename, fileBuffer, shouldDeflate);
      totalOutputBytes += fileBuffer.length;
      includedCount++;
    }

    if (includedCount === 0) {
      return NextResponse.json(
        {
          error: "Tidak ada berkas yang valid.",
          code: "NO_VALID_FILES",
          message: "Tidak ada berkas hasil pekerjaan valid yang dapat dikemas ke dalam ZIP.",
        },
        { status: 400 }
      );
    }

    const zipBuffer = zipWriter.toBuffer();

    const zipJobId = crypto.randomUUID();
    const { token, hash } = generateOwnerToken();
    await initJobDirectory(zipJobId);

    const safeZipName = requestedZipName.toLowerCase().endsWith(".zip")
      ? requestedZipName
      : `${requestedZipName}.zip`;

    const jobDir = getJobDir(zipJobId);
    const outputPath = resolveSafePath(jobDir, path.join("output", safeZipName));
    await fs.promises.writeFile(outputPath, zipBuffer);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

    const jobMeta: JobMetadata = {
      jobId: zipJobId,
      ownerTokenHash: hash,
      status: "succeeded",
      sourceFormat: "batch",
      targetFormat: "zip",
      originalFilename: safeZipName,
      inputFilename: "batch_manifest.json",
      outputFilename: safeZipName,
      inputSizeBytes: totalOutputBytes,
      outputSizeBytes: zipBuffer.length,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      metadata: {
        bundledFilesCount: includedCount,
      },
    };

    await writeJobMeta(zipJobId, jobMeta);

    return NextResponse.json(
      {
        status: "succeeded",
        job: {
          ...jobMeta,
          id: zipJobId,
          downloadUrl: `/api/jobs/${zipJobId}/download?token=${token}`,
        },
        ownerToken: token,
        downloadUrl: `/api/jobs/${zipJobId}/download?token=${token}`,
      },
      { status: 200 }
    );
  } catch (error) {
    const err = error as Error;
    const safeMsg = sanitizePublicErrorMessage(
      err?.message,
      "Terjadi kesalahan internal saat membuat arsip ZIP."
    );
    return NextResponse.json(
      {
        error: "Gagal membuat berkas arsip ZIP.",
        code: "BATCH_ZIP_ERROR",
        message: safeMsg,
      },
      { status: 500 }
    );
  }
}
