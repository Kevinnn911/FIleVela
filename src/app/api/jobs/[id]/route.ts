// File: src/app/api/jobs/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { isValidJobId } from "@/lib/storage/path-sanitizer";
import {
  extractTokenFromRequest,
  verifyOwnerToken,
} from "@/lib/security/token-auth";
import {
  deleteJobDirectory,
  isJobExpired,
  readJobMeta,
} from "@/lib/storage/temp-storage";
import {
  checkRateLimit,
  extractClientIp,
  logSecurityEvent,
} from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: {
    id: string;
  };
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, {
    bucket: "api:job-status",
    maxRequests: 120,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Terlalu banyak permintaan.",
        code: "RATE_LIMIT_EXCEEDED",
        message: "Batas pengecekan status terlampaui. Silakan coba lagi sesaat lagi.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
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
        message: "Format ID pekerjaan harus berupa UUID v4 yang sah.",
      },
      { status: 400 }
    );
  }

  const token = extractTokenFromRequest(request);
  if (!token) {
    return NextResponse.json(
      {
        error: "Token otorisasi diperlukan.",
        code: "UNAUTHORIZED",
        message: "Harap sertakan token kepemilikan pekerjaan yang sah.",
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
        message: "Pekerjaan dengan ID tersebut tidak ada atau sudah kedaluwarsa.",
      },
      { status: 404 }
    );
  }

  const isOwner = verifyOwnerToken(token, meta.ownerTokenHash);
  if (!isOwner) {
    logSecurityEvent({
      type: "unauthorized_access",
      route: `/api/jobs/${jobId}`,
      jobId,
      clientIp: extractClientIp(request),
      reason: "Token otorisasi tidak cocok pada GET /api/jobs/[id].",
    });
    return NextResponse.json(
      {
        error: "Akses ditolak.",
        code: "FORBIDDEN",
        message: "Token otorisasi tidak cocok dengan pemilik pekerjaan ini.",
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
        message: "Berkas sementara telah melewati batas retensi 60 menit dan dihapus otomatis.",
      },
      { status: 410 }
    );
  }

  return NextResponse.json(
    {
      id: meta.jobId,
      status: meta.status,
      sourceFormat: meta.sourceFormat,
      targetFormat: meta.targetFormat,
      originalFilename: meta.originalFilename,
      outputFilename: meta.outputFilename,
      sourceSizeBytes: meta.inputSizeBytes,
      outputSizeBytes: meta.outputSizeBytes,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      expiresAt: meta.expiresAt,
      isTransparent: meta.isTransparent,
      error: meta.error,
    },
    { status: 200 }
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const jobId = params.id;

  if (!isValidJobId(jobId)) {
    return NextResponse.json(
      {
        error: "ID pekerjaan tidak valid.",
        code: "INVALID_JOB_ID",
        message: "Format ID pekerjaan harus berupa UUID v4 yang sah.",
      },
      { status: 400 }
    );
  }

  const token = extractTokenFromRequest(request);
  if (!token) {
    return NextResponse.json(
      {
        error: "Token otorisasi diperlukan.",
        code: "UNAUTHORIZED",
        message: "Harap sertakan token kepemilikan pekerjaan yang sah.",
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
        message: "Pekerjaan tidak ditemukan atau sudah dihapus.",
      },
      { status: 404 }
    );
  }

  const isOwner = verifyOwnerToken(token, meta.ownerTokenHash);
  if (!isOwner) {
    logSecurityEvent({
      type: "unauthorized_access",
      route: `/api/jobs/${jobId}`,
      jobId,
      clientIp: extractClientIp(request),
      reason: "Token otorisasi tidak cocok pada GET /api/jobs/[id].",
    });
    return NextResponse.json(
      {
        error: "Akses ditolak.",
        code: "FORBIDDEN",
        message: "Token otorisasi tidak cocok dengan pemilik pekerjaan ini.",
      },
      { status: 403 }
    );
  }

  const deleted = await deleteJobDirectory(jobId);
  if (!deleted) {
    return NextResponse.json(
      {
        error: "Gagal menghapus pekerjaan.",
        code: "DELETE_FAILED",
        message: "Terjadi kesalahan saat menghapus berkas pekerjaan.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: "Berkas dan riwayat pekerjaan berhasil dihapus secara permanen.",
    },
    { status: 200 }
  );
}
