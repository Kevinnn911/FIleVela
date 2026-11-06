// File: src/app/api/downloader/extract/route.ts

import { NextRequest, NextResponse } from "next/server";
import { extractMediaMetadata } from "@/lib/downloader/media-extractor";
import {
  checkRateLimit,
  extractClientIp,
  logSecurityEvent,
  sanitizePublicErrorMessage,
} from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, {
    bucket: "api:downloader-extract",
    maxRequests: 20,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    logSecurityEvent({
      type: "rate_limit_exceeded",
      route: "/api/downloader/extract",
      clientIp: extractClientIp(request),
      reason: "Melebihi kuota ekstraksi metadata media per menit.",
    });
    return NextResponse.json(
      {
        error: "Terlalu banyak permintaan.",
        code: "RATE_LIMIT_EXCEEDED",
        message: "Batas ekstraksi URL terlampaui. Silakan coba lagi sesaat lagi.",
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
    const body = await request.json();
    const rawUrl = body?.url;

    if (!rawUrl || typeof rawUrl !== "string") {
      return NextResponse.json(
        {
          error: "Tautan URL tidak ditemukan.",
          code: "MISSING_URL",
          message: "Harap masukkan tautan video yang ingin diunduh.",
        },
        { status: 400 }
      );
    }

    const metadata = await extractMediaMetadata(rawUrl);

    return NextResponse.json(
      {
        success: true,
        metadata,
      },
      { status: 200 }
    );
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "Kesalahan tidak terduga.";
    if (/SSRF|DNS|lokal|internal|loopback/i.test(rawMessage)) {
      logSecurityEvent({
        type: "ssrf_blocked",
        route: "/api/downloader/extract",
        clientIp: extractClientIp(request),
        reason: rawMessage,
      });
    }
    const safeMessage = sanitizePublicErrorMessage(
      rawMessage,
      "Gagal mengekstrak informasi media."
    );
    return NextResponse.json(
      {
        error: "Gagal mengekstrak informasi media.",
        code: "EXTRACTION_FAILED",
        message: safeMessage,
      },
      { status: 400 }
    );
  }
}

