// File: src/app/api/capabilities/route.ts

import { NextRequest, NextResponse } from "next/server";
import { capabilityRegistry } from "@/lib/adapters/registry";
import {
  CapabilitiesCatalogResponse,
  CapabilitiesErrorResponse,
  CapabilitiesSourceResponse,
} from "@/lib/adapters/types";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest
): Promise<
  NextResponse<
    | CapabilitiesSourceResponse
    | CapabilitiesCatalogResponse
    | CapabilitiesErrorResponse
  >
> {
  try {
    const { searchParams } = new URL(request.url);
    const sourceParam = searchParams.get("source");

    if (!sourceParam || sourceParam.trim() === "") {
      const catalog = await capabilityRegistry.getCatalogResponse();
      return NextResponse.json(catalog, {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          "Content-Type": "application/json",
        },
      });
    }

    const normalizedSource = capabilityRegistry.normalizeFormat(sourceParam);

    if (
      normalizedSource.length > 20 ||
      !/^[a-zA-Z0-9_-]+$/.test(normalizedSource)
    ) {
      const errorResponse: CapabilitiesErrorResponse = {
        error: "Format sumber tidak valid.",
        code: "INVALID_SOURCE_FORMAT",
        message: "Format harus berupa alfanumerik tanpa karakter ilegal.",
        sourceFormat: sourceParam,
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    const { sourceCapability, targets, unavailableAdapters } =
      await capabilityRegistry.getTargetsForSource(normalizedSource);

    if (targets.length === 0 && unavailableAdapters.length === 0) {
      const catalog = await capabilityRegistry.getCatalogResponse();
      const allKnownSources = catalog.supportedSources.map((s) => s.format);

      const errorResponse: CapabilitiesErrorResponse = {
        error: "Format sumber belum didukung.",
        code: "SOURCE_NOT_SUPPORTED",
        message: `Format '${sourceParam}' belum didukung oleh FileFlow saat ini.`,
        sourceFormat: sourceParam,
        supportedFormats: allKnownSources,
        unavailableAdapters: [],
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    const responsePayload: CapabilitiesSourceResponse = {
      source: {
        format: normalizedSource,
        mimeType: sourceCapability?.mimeType || "application/octet-stream",
        category: sourceCapability?.category || "data",
        label: sourceCapability?.label || normalizedSource.toUpperCase(),
      },
      targets,
      unavailableAdapters,
    };

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        "Content-Type": "application/json",
      },
    });
  } catch (_error) {
    const errorResponse: CapabilitiesErrorResponse = {
      error: "Terjadi kesalahan internal server.",
      code: "SERVER_ERROR",
      message: "Gagal memproses permintaan kemampuan konverter.",
    };
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
