// File: tests/integration/capabilities-api.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as capabilitiesHandler } from "@/app/api/capabilities/route";
import { GET as healthHandler } from "@/app/api/health/route";
import { CapabilityRegistry } from "@/lib/adapters/registry";
import {
  ConversionResult,
  ConversionTarget,
  FileCategory,
  IConversionAdapter,
} from "@/lib/adapters/types";

class TestSharpImageAdapter implements IConversionAdapter {
  public readonly id = "sharp-image-adapter";
  public readonly name = "Sharp Image Adapter";
  public readonly category: FileCategory = "image";

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public getSetupInstructions(): string {
    return "Sharp terpasang secara native.";
  }

  public getSupportedSources(): string[] {
    return ["png", "jpg", "jpeg", "webp", "avif"];
  }

  public async getSupportedTargets(sourceFormat: string): Promise<ConversionTarget[]> {
    const all = ["jpg", "webp", "avif", "png"];
    return all
      .filter((fmt) => fmt !== sourceFormat)
      .map((fmt) => ({
        targetFormat: fmt,
        label: fmt.toUpperCase(),
        mimeType: `image/${fmt === "jpg" ? "jpeg" : fmt}`,
        adapterId: this.id,
        isAvailable: true,
      }));
  }

  public async convert(): Promise<ConversionResult> {
    return {
      outputBytes: 2048,
      mimeType: "image/jpeg",
      outputPath: "test-output.jpg",
    };
  }
}

class TestLibreOfficeAdapter implements IConversionAdapter {
  public readonly id = "libreoffice-adapter";
  public readonly name = "LibreOffice Document Adapter";
  public readonly category: FileCategory = "document";

  public async isAvailable(): Promise<boolean> {
    return false;
  }

  public getSetupInstructions(): string {
    return "Pasang LibreOffice dan pastikan 'soffice' tersedia di PATH sistem.";
  }

  public getSupportedSources(): string[] {
    return ["docx", "odt", "rtf"];
  }

  public async getSupportedTargets(): Promise<ConversionTarget[]> {
    return [
      {
        targetFormat: "pdf",
        label: "PDF",
        mimeType: "application/pdf",
        adapterId: this.id,
        isAvailable: false,
      },
    ];
  }

  public async convert(): Promise<ConversionResult> {
    throw new Error("LibreOffice tidak tersedia.");
  }
}

describe("Capabilities and Health API Integration Tests", () => {
  beforeEach(() => {
    CapabilityRegistry.resetInstance();
    const registry = CapabilityRegistry.getInstance();
    registry.setCacheTtlMs(0);
    registry.registerAdapter(new TestSharpImageAdapter());
    registry.registerAdapter(new TestLibreOfficeAdapter());
  });

  describe("GET /api/capabilities", () => {
    it("should return valid conversion targets for an active image format", async () => {
      const request = new NextRequest("http://localhost:3000/api/capabilities?source=png");
      const response = await capabilitiesHandler(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.source.format).toBe("png");
      expect(json.source.category).toBe("image");
      expect(json.targets.length).toBeGreaterThan(0);
      expect(json.targets.every((t: ConversionTarget) => t.isAvailable)).toBe(true);
      expect(json.unavailableAdapters.length).toBe(0);
    });

    it("should return honest unavailable notices and zero targets for an inactive document format", async () => {
      const request = new NextRequest("http://localhost:3000/api/capabilities?source=docx");
      const response = await capabilitiesHandler(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.source.format).toBe("docx");
      expect(json.targets.length).toBe(0);
      expect(json.unavailableAdapters.length).toBe(1);
      expect(json.unavailableAdapters[0].adapterId).toBe("libreoffice-adapter");
      expect(json.unavailableAdapters[0].setupInstructions).toContain("LibreOffice");
    });

    it("should return 400 with descriptive error for unknown source format", async () => {
      const request = new NextRequest("http://localhost:3000/api/capabilities?source=unknown_bin");
      const response = await capabilitiesHandler(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.code).toBe("SOURCE_NOT_SUPPORTED");
      expect(json.error).toContain("Format sumber belum didukung");
    });

    it("should return 400 for illegal source format characters", async () => {
      const request = new NextRequest("http://localhost:3000/api/capabilities?source=png;drop%20table");
      const response = await capabilitiesHandler(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.code).toBe("INVALID_SOURCE_FORMAT");
    });

    it("should return full catalog when source parameter is omitted", async () => {
      const request = new NextRequest("http://localhost:3000/api/capabilities");
      const response = await capabilitiesHandler(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.status).toBe("ok");
      expect(json.categories).toBeDefined();
      expect(json.adapters.length).toBe(2);
      expect(json.totalActiveAdapters).toBe(1);
    });

    it("should return HTTP 400 SOURCE_NOT_SUPPORTED when format has zero active targets and zero inactive notices", async () => {
      // 'yaml' is in KNOWN_FORMAT_CATALOG, but neither TestSharpImageAdapter nor TestLibreOfficeAdapter supports 'yaml'
      const request = new NextRequest("http://localhost:3000/api/capabilities?source=yaml");
      const response = await capabilitiesHandler(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.code).toBe("SOURCE_NOT_SUPPORTED");
      expect(json.error).toContain("Format sumber belum didukung");
      expect(json.message).toContain("yaml");
      expect(Array.isArray(json.supportedFormats)).toBe(true);
      expect(json.unavailableAdapters).toEqual([]);
    });

    it("should handle format aliases, uppercase, and leading dots gracefully (e.g. .PNG, jpeg, WEBP)", async () => {
      // Leading dot and uppercase: .PNG
      const reqDot = new NextRequest("http://localhost:3000/api/capabilities?source=.PNG");
      const resDot = await capabilitiesHandler(reqDot);
      expect(resDot.status).toBe(200);
      const jsonDot = await resDot.json();
      expect(jsonDot.source.format).toBe("png");
      expect(jsonDot.targets.length).toBeGreaterThan(0);

      // Alias: jpeg -> jpg
      const reqJpeg = new NextRequest("http://localhost:3000/api/capabilities?source=jpeg");
      const resJpeg = await capabilitiesHandler(reqJpeg);
      expect(resJpeg.status).toBe(200);
      const jsonJpeg = await resJpeg.json();
      expect(jsonJpeg.source.format).toBe("jpg");

      // Whitespace padded
      const reqSpace = new NextRequest("http://localhost:3000/api/capabilities?source=%20webp%20");
      const resSpace = await capabilitiesHandler(reqSpace);
      expect(resSpace.status).toBe(200);
      const jsonSpace = await resSpace.json();
      expect(jsonSpace.source.format).toBe("webp");
    });
  });

  describe("GET /api/health", () => {
    it("should return 200 with operational metrics and adapter status", async () => {
      const response = await healthHandler();
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.service).toBe("FileFlow");
      expect(json.status).toBe("healthy");
      expect(typeof json.uptimeSeconds).toBe("number");
      expect(json.adapters.total).toBe(2);
      expect(json.adapters.active).toBe(1);
      expect(json.adapters.inactive).toBe(1);
      expect(json.system.platform).toBeDefined();
      expect(json.storage.status).toBe("ready");
    });
  });
});
