// File: src/app/api/jobs/route.ts

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import { capabilityRegistry } from "@/lib/adapters/registry";
import { verifyFileMime } from "@/lib/security/mime-detector";
import {
  checkRateLimit,
  logSecurityEvent,
  sanitizeJsonOptions,
  sanitizePublicErrorMessage,
} from "@/lib/security/rate-limiter";
import { generateOwnerToken } from "@/lib/security/token-auth";
import {
  getJobDir,
  initJobDirectory,
  JobMetadata,
  saveInputFile,
  writeJobMeta,
} from "@/lib/storage/temp-storage";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, {
    bucket: "jobs-create",
    maxRequests: 45,
    windowMs: 60 * 1000,
  });

  if (!rateLimit.allowed) {
    logSecurityEvent({
      type: "rate_limit_exceeded",
      route: "/api/jobs",
      reason: "Job creation rate limit exceeded",
    });
    return NextResponse.json(
      {
        error: "Terlalu banyak permintaan konversi.",
        code: "RATE_LIMIT_EXCEEDED",
        message: "Silakan tunggu beberapa saat sebelum mengirim berkas berikutnya.",
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
    const targetFormatParam = formData.get("targetFormat");
    const optionsRaw = formData.get("options");

    if (!file || typeof file === "string" || !(file instanceof Blob)) {
      return NextResponse.json(
        {
          error: "Berkas tidak ditemukan.",
          code: "MISSING_FILE",
          message: "Harap lampirkan berkas yang ingin dikonversi.",
        },
        { status: 400 }
      );
    }

    if (!targetFormatParam || typeof targetFormatParam !== "string") {
      return NextResponse.json(
        {
          error: "Format tujuan tidak ditemukan.",
          code: "MISSING_TARGET_FORMAT",
          message: "Harap tentukan format berkas target keluaran.",
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
          error: "Ukuran berkas melebihi batas maksimum.",
          code: "FILE_TOO_LARGE",
          message: `Ukuran maksimum berkas yang diperbolehkan adalah ${
            MAX_FILE_SIZE_BYTES / (1024 * 1024)
          } MB.`,
        },
        { status: 400 }
      );
    }

    const originalFilename = file.name || "uploaded_file";
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const declaredExt =
      path.extname(originalFilename).replace(/^\.+/, "") || file.type || "";
    const mimeVerification = verifyFileMime(fileBuffer, declaredExt);
    const sourceFormat = mimeVerification.detectedFormat;

    if (!mimeVerification.valid || !sourceFormat) {
      logSecurityEvent({
        type: "invalid_mime_rejected",
        route: "/api/jobs",
        reason: mimeVerification.error || "MIME verification failed",
      });
      return NextResponse.json(
        {
          error: "Tipe berkas tidak dikenali atau format tidak sah.",
          code: "UNRECOGNIZED_MIME_SIGNATURE",
          message:
            "Format konten berkas tidak cocok dengan ekstensi atau belum didukung.",
        },
        { status: 400 }
      );
    }

    const normalizedTarget = capabilityRegistry.normalizeFormat(targetFormatParam);
    const adapter = await capabilityRegistry.findAdapterForPair(
      sourceFormat,
      normalizedTarget
    );

    if (!adapter) {
      const { unavailableAdapters } =
        await capabilityRegistry.getTargetsForSource(sourceFormat);
      const isConfigIssue = unavailableAdapters.length > 0;

      return NextResponse.json(
        {
          error: "Pasangan konversi tidak didukung atau engine belum terpasang.",
          code: isConfigIssue ? "ADAPTER_UNAVAILABLE" : "UNSUPPORTED_CONVERSION_PAIR",
          message: isConfigIssue
            ? unavailableAdapters[0]?.setupInstructions ||
              "Engine konverter belum dikonfigurasi di server."
            : `Konversi dari ${sourceFormat} ke ${normalizedTarget} belum didukung.`,
        },
        { status: 400 }
      );
    }

    const parsedOptions = sanitizeJsonOptions(optionsRaw);

    const jobId = crypto.randomUUID();
    const { token: rawOwnerToken, hash: ownerTokenHash } = generateOwnerToken();

    await initJobDirectory(jobId);

    const { sanitizedName } = await saveInputFile(
      jobId,
      originalFilename,
      fileBuffer
    );

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

    const initialMeta: JobMetadata = {
      jobId,
      ownerTokenHash,
      status: "processing",
      sourceFormat,
      targetFormat: normalizedTarget,
      originalFilename,
      inputFilename: sanitizedName,
      inputSizeBytes: file.size,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      error: null,
      metadata: parsedOptions,
    };

    await writeJobMeta(jobId, initialMeta);

    const jobDir = getJobDir(jobId);
    const inputPath = path.join(jobDir, "input", sanitizedName);
    const nameWithoutExt = sanitizedName.replace(/\.[^/.]+$/, "");
    const outputFilename = `${nameWithoutExt}.${normalizedTarget}`;
    const outputPath = path.join(jobDir, "output", outputFilename);

    try {
      const conversionResult = await adapter.convert(
        inputPath,
        outputPath,
        sourceFormat,
        normalizedTarget,
        parsedOptions
      );

      const completedMeta: JobMetadata = {
        ...initialMeta,
        status: "succeeded",
        outputFilename,
        outputSizeBytes: conversionResult.outputBytes,
        updatedAt: new Date().toISOString(),
        metadata: {
          ...initialMeta.metadata,
          durationMs: conversionResult.durationMs,
          mimeType: conversionResult.mimeType,
        },
      };

      await writeJobMeta(jobId, completedMeta);

      return NextResponse.json(
        {
          job: {
            id: jobId,
            status: "succeeded",
            sourceFormat,
            targetFormat: normalizedTarget,
            originalFilename,
            outputFilename,
            sourceSizeBytes: file.size,
            outputSizeBytes: conversionResult.outputBytes,
            createdAt: initialMeta.createdAt,
            expiresAt: initialMeta.expiresAt,
            durationMs: conversionResult.durationMs,
            downloadUrl: `/api/jobs/${jobId}/download?token=${rawOwnerToken}`,
          },
          ownerToken: rawOwnerToken,
          downloadUrl: `/api/jobs/${jobId}/download?token=${rawOwnerToken}`,
        },
        { status: 201 }
      );
    } catch (conversionErr) {
      const rawErrMsg =
        conversionErr instanceof Error
          ? conversionErr.message
          : "Terjadi kesalahan saat memproses konversi berkas.";
      const errMsg = sanitizePublicErrorMessage(
        rawErrMsg,
        "Terjadi kesalahan saat memproses konversi berkas."
      );

      logSecurityEvent({
        type: "conversion_failed",
        route: "/api/jobs",
        jobId,
        reason: errMsg,
      });

      const failureMeta: JobMetadata = {
        ...initialMeta,
        status: "failed",
        updatedAt: new Date().toISOString(),
        error: {
          code: "CONVERSION_EXECUTION_FAILED",
          message: errMsg,
        },
      };

      await writeJobMeta(jobId, failureMeta);

      return NextResponse.json(
        {
          error: "Gagal mengeksekusi konversi berkas.",
          code: "CONVERSION_EXECUTION_FAILED",
          message: errMsg,
          job: {
            id: jobId,
            status: "failed",
            sourceFormat,
            targetFormat: normalizedTarget,
            originalFilename,
            sourceSizeBytes: file.size,
            createdAt: initialMeta.createdAt,
            expiresAt: initialMeta.expiresAt,
            error: failureMeta.error,
          },
          ownerToken: rawOwnerToken,
        },
        { status: 422 }
      );
    }
  } catch (err) {
    const safeMsg = sanitizePublicErrorMessage(
      err instanceof Error ? err.message : undefined,
      "Kesalahan tidak terduga."
    );
    return NextResponse.json(
      {
        error: "Terjadi kesalahan internal server.",
        code: "INTERNAL_SERVER_ERROR",
        message: safeMsg,
      },
      { status: 500 }
    );
  }
}
