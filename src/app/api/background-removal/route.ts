// File: src/app/api/background-removal/route.ts

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import { SharpLocalBgRemovalProvider } from "@/lib/bg-removal/sharp-local-provider";
import { BgMode } from "@/lib/bg-removal/types";
import { verifyFileMime } from "@/lib/security/mime-detector";
import {
  checkRateLimit,
  logSecurityEvent,
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

const MAX_IMAGE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const SUPPORTED_IMAGE_FORMATS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "avif",
  "tiff",
  "gif",
  "bmp",
  "svg",
  "ico",
];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, {
    bucket: "bg-removal",
    maxRequests: 35,
    windowMs: 60 * 1000,
  });

  if (!rateLimit.allowed) {
    logSecurityEvent({
      type: "rate_limit_exceeded",
      route: "/api/background-removal",
      reason: "Background removal rate limit exceeded",
    });
    return NextResponse.json(
      {
        error: "Terlalu banyak permintaan penghapusan latar.",
        code: "RATE_LIMIT_EXCEEDED",
        message: "Silakan tunggu beberapa saat sebelum memproses gambar berikutnya.",
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
    const toleranceParam = formData.get("tolerance");
    const bgColorParam = formData.get("backgroundColor");
    const modeParam = formData.get("mode") as BgMode | null;
    const replacementColorParam = formData.get("replacementColor");
    const gradStartParam = formData.get("gradientStart");
    const gradEndParam = formData.get("gradientEnd");

    if (!file || typeof file === "string" || !(file instanceof Blob)) {
      return NextResponse.json(
        {
          error: "Berkas gambar tidak ditemukan.",
          code: "MISSING_FILE",
          message: "Harap lampirkan gambar yang ingin dihapus latar belakangnya.",
        },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        {
          error: "Berkas gambar kosong.",
          code: "EMPTY_FILE",
          message: "Berkas gambar berukuran 0 byte tidak dapat diproses.",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: "Ukuran gambar terlalu besar.",
          code: "FILE_TOO_LARGE",
          message: `Ukuran maksimum gambar untuk hapus background adalah ${
            MAX_IMAGE_SIZE_BYTES / (1024 * 1024)
          } MB.`,
        },
        { status: 400 }
      );
    }

    const originalFilename = file.name || "image.png";
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const declaredExt =
      path.extname(originalFilename).replace(/^\.+/, "") || file.type || "";
    const mimeVerification = verifyFileMime(fileBuffer, declaredExt);
    const detectedFormat = (mimeVerification.detectedFormat || "").toLowerCase();

    if (
      !mimeVerification.valid ||
      !detectedFormat ||
      !SUPPORTED_IMAGE_FORMATS.includes(detectedFormat)
    ) {
      return NextResponse.json(
        {
          error: "Format berkas tidak didukung untuk penghapusan latar belakang.",
          code: "UNSUPPORTED_IMAGE_FORMAT",
          message:
            "Fitur hapus background mendukung format gambar: PNG, JPG, WebP, AVIF, TIFF, GIF, BMP, SVG, dan ICO.",
        },
        { status: 400 }
      );
    }

    const parsedTolerance = toleranceParam !== null ? Number(toleranceParam) : undefined;
    const tolerance =
      parsedTolerance !== undefined && !Number.isNaN(parsedTolerance)
        ? parsedTolerance
        : undefined;

    const backgroundColor =
      typeof bgColorParam === "string" && bgColorParam.trim().length > 0
        ? bgColorParam.trim()
        : undefined;

    const mode: BgMode =
      modeParam === "solid" || modeParam === "gradient" ? modeParam : "transparent";

    const replacementColor =
      typeof replacementColorParam === "string" &&
      replacementColorParam.trim().length > 0
        ? replacementColorParam.trim()
        : undefined;

    const gradientStart =
      typeof gradStartParam === "string" && gradStartParam.trim().length > 0
        ? gradStartParam.trim()
        : undefined;

    const gradientEnd =
      typeof gradEndParam === "string" && gradEndParam.trim().length > 0
        ? gradEndParam.trim()
        : undefined;

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
    const isTransparent = mode === "transparent";

    const initialMeta: JobMetadata = {
      jobId,
      ownerTokenHash,
      status: "processing",
      sourceFormat: detectedFormat,
      targetFormat: "png",
      originalFilename,
      inputFilename: sanitizedName,
      inputSizeBytes: file.size,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isTransparent,
      error: null,
      metadata: {
        operation: "remove-background",
        mode,
        tolerance,
        backgroundColor,
        replacementColor,
        gradientStart,
        gradientEnd,
      },
    };

    await writeJobMeta(jobId, initialMeta);

    const jobDir = getJobDir(jobId);
    const inputPath = path.join(jobDir, "input", sanitizedName);
    const nameWithoutExt = sanitizedName.replace(/\.[^/.]+$/, "");
    const outputFilename = `${nameWithoutExt}_nobg.png`;
    const outputPath = path.join(jobDir, "output", outputFilename);

    const provider = new SharpLocalBgRemovalProvider();

    try {
      const bgResult = await provider.removeBackground(inputPath, outputPath, {
        mode,
        tolerance,
        backgroundColor,
        replacementColor,
        gradientStart,
        gradientEnd,
      });

      const completedMeta: JobMetadata = {
        ...initialMeta,
        status: "succeeded",
        outputFilename,
        outputSizeBytes: bgResult.outputBytes,
        updatedAt: new Date().toISOString(),
        metadata: {
          ...initialMeta.metadata,
          durationMs: bgResult.durationMs,
          transparentPixelCount: bgResult.transparentPixelCount,
          provider: bgResult.provider,
        },
      };

      await writeJobMeta(jobId, completedMeta);

      return NextResponse.json(
        {
          job: {
            id: jobId,
            status: "succeeded",
            sourceFormat: detectedFormat,
            targetFormat: "png",
            originalFilename,
            outputFilename,
            sourceSizeBytes: file.size,
            outputSizeBytes: bgResult.outputBytes,
            createdAt: initialMeta.createdAt,
            expiresAt: initialMeta.expiresAt,
            isTransparent,
            durationMs: bgResult.durationMs,
            transparentPixelCount: bgResult.transparentPixelCount,
            downloadUrl: `/api/jobs/${jobId}/download?token=${rawOwnerToken}`,
          },
          ownerToken: rawOwnerToken,
          downloadUrl: `/api/jobs/${jobId}/download?token=${rawOwnerToken}`,
        },
        { status: 201 }
      );
    } catch (bgErr) {
      const errMsg =
        bgErr instanceof Error
          ? bgErr.message
          : "Terjadi kesalahan saat menghapus latar belakang gambar.";

      const failureMeta: JobMetadata = {
        ...initialMeta,
        status: "failed",
        updatedAt: new Date().toISOString(),
        error: {
          code: "BG_REMOVAL_FAILED",
          message: errMsg,
        },
      };

      await writeJobMeta(jobId, failureMeta);

      return NextResponse.json(
        {
          error: "Gagal menghapus latar belakang gambar.",
          code: "BG_REMOVAL_FAILED",
          message: errMsg,
          job: {
            id: jobId,
            status: "failed",
            sourceFormat: detectedFormat,
            targetFormat: "png",
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
