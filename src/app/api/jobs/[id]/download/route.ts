// File: src/app/api/jobs/[id]/download/route.ts

import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import {
  buildContentDispositionHeader,
  isValidJobId,
} from "@/lib/storage/path-sanitizer";
import {
  extractTokenFromRequest,
  verifyOwnerToken,
} from "@/lib/security/token-auth";
import {
  checkRateLimit,
  logSecurityEvent,
} from "@/lib/security/rate-limiter";
import {
  deleteJobDirectory,
  getJobOutputFilePath,
  isJobExpired,
  readJobMeta,
} from "@/lib/storage/temp-storage";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: {
    id: string;
  };
}

const EXTENSION_MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  tiff: "image/tiff",
  tif: "image/tiff",
  gif: "image/gif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text",
  rtf: "application/rtf",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  aac: "audio/aac",
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  tsv: "text/tab-separated-values; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  yaml: "application/x-yaml; charset=utf-8",
  yml: "application/x-yaml; charset=utf-8",
  zip: "application/zip",
};

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, {
    bucket: "job-download",
    maxRequests: 120,
    windowMs: 60 * 1000,
  });

  if (!rateLimit.allowed) {
    logSecurityEvent({
      type: "rate_limit_exceeded",
      route: "/api/jobs/[id]/download",
      reason: "Download rate limit exceeded",
    });
    return NextResponse.json(
      {
        error: "Terlalu banyak permintaan unduhan.",
        code: "RATE_LIMIT_EXCEEDED",
        message: "Silakan tunggu beberapa saat sebelum mengunduh kembali.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": rateLimit.retryAfterSeconds.toString(),
        },
      }
    );
  }

  const jobId = params.id;

  if (!isValidJobId(jobId)) {
    return NextResponse.json(
      {
        error: "ID pekerjaan tidak valid.",
        code: "INVALID_JOB_ID",
      },
      { status: 400 }
    );
  }

  const token = extractTokenFromRequest(request);
  if (!token) {
    logSecurityEvent({
      type: "unauthorized_access",
      route: "/api/jobs/[id]/download",
      jobId,
      reason: "Missing owner token on download request",
    });
    return NextResponse.json(
      {
        error: "Token otorisasi diperlukan.",
        code: "UNAUTHORIZED",
      },
      { status: 401 }
    );
  }

  const meta = await readJobMeta(jobId);
  if (!meta) {
    return NextResponse.json(
      {
        error: "Pekerjaan tidak ditemukan.",
        code: "JOB_NOT_FOUND",
      },
      { status: 404 }
    );
  }

  const isOwner = verifyOwnerToken(token, meta.ownerTokenHash);
  if (!isOwner) {
    logSecurityEvent({
      type: "unauthorized_access",
      route: "/api/jobs/[id]/download",
      jobId,
      reason: "Invalid owner token on download request",
    });
    return NextResponse.json(
      {
        error: "Akses ditolak.",
        code: "FORBIDDEN",
      },
      { status: 403 }
    );
  }

  if (isJobExpired(meta)) {
    await deleteJobDirectory(jobId);
    return NextResponse.json(
      {
        error: "Masa simpan berkas telah berakhir.",
        code: "JOB_EXPIRED",
      },
      { status: 410 }
    );
  }

  if (meta.status !== "succeeded") {
    return NextResponse.json(
      {
        error: "Hasil pekerjaan belum siap atau telah gagal.",
        code: "JOB_NOT_READY",
        status: meta.status,
      },
      { status: 400 }
    );
  }

  const outputPath = await getJobOutputFilePath(jobId);
  if (!outputPath || !fs.existsSync(outputPath)) {
    return NextResponse.json(
      {
        error: "Berkas keluaran tidak ditemukan di media penyimpanan.",
        code: "OUTPUT_FILE_MISSING",
      },
      { status: 404 }
    );
  }

  const fileStat = await fs.promises.stat(outputPath);
  const fileBuffer = await fs.promises.readFile(outputPath);

  const downloadFilename =
    meta.outputFilename || `converted_file.${meta.targetFormat}`;
  const ext = downloadFilename.split(".").pop()?.toLowerCase() || "";
  const contentType =
    EXTENSION_MIME_MAP[ext] || "application/octet-stream";

  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": buildContentDispositionHeader(downloadFilename),
      "Content-Length": fileStat.size.toString(),
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
