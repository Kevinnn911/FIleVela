// File: src/app/api/downloader/download/route.ts

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { processMediaDownload } from "@/lib/downloader/download-service";
import { buildContentDispositionHeader } from "@/lib/storage/path-sanitizer";
import {
  checkRateLimit,
  extractClientIp,
  logSecurityEvent,
  sanitizePublicErrorMessage,
} from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, {
    bucket: "api:downloader-download",
    maxRequests: 15,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    logSecurityEvent({
      type: "rate_limit_exceeded",
      route: "/api/downloader/download",
      clientIp: extractClientIp(request),
      reason: "Melebihi kuota unduh media per menit.",
    });
    return NextResponse.json(
      {
        error: "Terlalu banyak permintaan.",
        code: "RATE_LIMIT_EXCEEDED",
        message: "Batas pengunduhan media terlampaui. Silakan coba lagi sesaat lagi.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");
  const format = (searchParams.get("format") || "mp4").toLowerCase();
  const quality = searchParams.get("quality") || undefined;
  const rawTitle = searchParams.get("title") || "download";

  if (!rawUrl) {
    return NextResponse.json(
      { error: "Parameter url diperlukan.", code: "MISSING_URL" },
      { status: 400 }
    );
  }

  const selectedFormat: "mp4" | "mp3" = format === "mp3" ? "mp3" : "mp4";

  try {
    const result = await processMediaDownload(
      rawUrl,
      selectedFormat,
      quality,
      rawTitle
    );

    let cleanedUp = false;
    const safeCleanup = () => {
      if (!cleanedUp) {
        cleanedUp = true;
        result.cleanup();
      }
    };

    const nodeStream = fs.createReadStream(result.filePath, { autoClose: true });
    let streamFinished = false;

    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        nodeStream.on("data", (chunk: Buffer | string) => {
          const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          controller.enqueue(new Uint8Array(buf));
        });
        nodeStream.on("end", () => {
          streamFinished = true;
          nodeStream.destroy();
        });
        nodeStream.on("close", () => {
          safeCleanup();
          if (streamFinished) {
            try {
              controller.close();
            } catch {
              // Stream already closed
            }
          }
        });
        nodeStream.on("error", (streamErr) => {
          nodeStream.destroy();
          safeCleanup();
          try {
            controller.error(streamErr);
          } catch {
            // Stream already errored
          }
        });
      },
      cancel() {
        nodeStream.destroy();
        safeCleanup();
      },
    });

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": buildContentDispositionHeader(result.filename),
        "Content-Length": result.size.toString(),
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    const rawMsg =
      err instanceof Error
        ? err.message
        : "Terjadi kesalahan internal saat mengunduh media.";
    const isValidation = /SSRF|URL|protokol|kredensial|host|DNS/i.test(rawMsg);

    if (isValidation) {
      logSecurityEvent({
        type: "ssrf_blocked",
        route: "/api/downloader/download",
        clientIp: extractClientIp(request),
        reason: rawMsg,
      });
    }

    const safeMsg = sanitizePublicErrorMessage(
      rawMsg,
      "Terjadi kesalahan internal saat mengunduh media."
    );

    return NextResponse.json(
      {
        error: "Gagal memproses pengunduhan media.",
        code: isValidation ? "INVALID_URL" : "DOWNLOAD_FAILED",
        message: safeMsg,
      },
      { status: isValidation ? 400 : 422 }
    );
  }
}
