// File: src/app/api/health/route.ts

import { NextResponse } from "next/server";
import { capabilityRegistry } from "@/lib/adapters/registry";

export const dynamic = "force-dynamic";

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  service: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  nodeVersion: string;
  system: {
    platform: string;
    arch: string;
  };
  adapters: {
    total: number;
    active: number;
    inactive: number;
    details: Array<{
      id: string;
      name: string;
      category: string;
      isAvailable: boolean;
      supportedSourcesCount: number;
      setupInstructions?: string;
    }>;
  };
  storage: {
    status: string;
  };
}

const startTime = Date.now();

export async function GET(): Promise<NextResponse<HealthResponse>> {
  try {
    const adapterSummaries = await capabilityRegistry.getAdapterSummaries();
    const total = adapterSummaries.length;
    const active = adapterSummaries.filter((a) => a.isAvailable).length;
    const inactive = total - active;

    const overallStatus: "healthy" | "degraded" | "unhealthy" =
      total === 0 || active > 0 ? "healthy" : "degraded";

    const responsePayload: HealthResponse = {
      status: overallStatus,
      service: "FileFlow",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      environment: process.env.NODE_ENV || "development",
      nodeVersion: process.version,
      system: {
        platform: process.platform,
        arch: process.arch,
      },
      adapters: {
        total,
        active,
        inactive,
        details: adapterSummaries,
      },
      storage: {
        status: "ready",
      },
    };

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Type": "application/json",
      },
    });
  } catch (_error) {
    const fallbackPayload: HealthResponse = {
      status: "unhealthy",
      service: "FileFlow",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      environment: process.env.NODE_ENV || "development",
      nodeVersion: process.version,
      system: {
        platform: process.platform,
        arch: process.arch,
      },
      adapters: {
        total: 0,
        active: 0,
        inactive: 0,
        details: [],
      },
      storage: {
        status: "error",
      },
    };

    return NextResponse.json(fallbackPayload, {
      status: 503,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Type": "application/json",
      },
    });
  }
}
