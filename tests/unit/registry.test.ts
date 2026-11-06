// File: tests/unit/registry.test.ts

import { describe, it, expect, beforeEach, vi } from "vitest";
import { CapabilityRegistry } from "@/lib/adapters/registry";
import {
  ConversionResult,
  ConversionTarget,
  FileCategory,
  IConversionAdapter,
} from "@/lib/adapters/types";

class MockActiveImageAdapter implements IConversionAdapter {
  public readonly id = "mock-image-adapter";
  public readonly name = "Mock Active Image Adapter";
  public readonly category: FileCategory = "image";

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public getSetupInstructions(): string {
    return "No setup required.";
  }

  public getSupportedSources(): string[] {
    return ["png", "jpg", "webp"];
  }

  public async getSupportedTargets(sourceFormat: string): Promise<ConversionTarget[]> {
    if (sourceFormat === "png") {
      return [
        {
          targetFormat: "jpg",
          label: "JPEG Image",
          mimeType: "image/jpeg",
          adapterId: this.id,
          isAvailable: true,
          optionsSchema: {
            quality: {
              name: "quality",
              label: "Kualitas",
              type: "number",
              default: 80,
              min: 1,
              max: 100,
            },
          },
        },
        {
          targetFormat: "webp",
          label: "WebP Image",
          mimeType: "image/webp",
          adapterId: this.id,
          isAvailable: true,
        },
      ];
    }
    return [];
  }

  public async convert(
    _inputPath: string,
    outputPath: string,
    _sourceFormat: string,
    targetFormat: string
  ): Promise<ConversionResult> {
    return {
      outputBytes: 1024,
      mimeType: `image/${targetFormat}`,
      outputPath,
      durationMs: 50,
    };
  }
}

class MockInactiveDocumentAdapter implements IConversionAdapter {
  public readonly id = "mock-doc-adapter";
  public readonly name = "Mock Inactive Document Adapter";
  public readonly category: FileCategory = "document";

  public async isAvailable(): Promise<boolean> {
    return false;
  }

  public getSetupInstructions(): string {
    return "Pasang LibreOffice dan pastikan 'soffice' tersedia di PATH sistem.";
  }

  public getSupportedSources(): string[] {
    return ["docx", "odt"];
  }

  public async getSupportedTargets(): Promise<ConversionTarget[]> {
    return [
      {
        targetFormat: "pdf",
        label: "PDF Document",
        mimeType: "application/pdf",
        adapterId: this.id,
        isAvailable: false,
        statusReason: "LibreOffice tidak terdeteksi pada server.",
      },
    ];
  }

  public async convert(): Promise<ConversionResult> {
    throw new Error("Adapter tidak aktif.");
  }
}

describe("CapabilityRegistry Unit Tests", () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    CapabilityRegistry.resetInstance();
    registry = CapabilityRegistry.getInstance();
    registry.setCacheTtlMs(0);
  });

  it("should enforce singleton pattern", () => {
    const instanceA = CapabilityRegistry.getInstance();
    const instanceB = CapabilityRegistry.getInstance();
    expect(instanceA).toBe(instanceB);
  });

  it("should register, retrieve, and unregister adapters", () => {
    const adapter = new MockActiveImageAdapter();
    registry.registerAdapter(adapter);

    expect(registry.getAdapter("mock-image-adapter")).toBe(adapter);
    expect(registry.getAllAdapters().length).toBe(1);

    const unregistered = registry.unregisterAdapter("mock-image-adapter");
    expect(unregistered).toBe(true);
    expect(registry.getAdapter("mock-image-adapter")).toBeUndefined();
  });

  it("should normalize format strings correctly", () => {
    expect(registry.normalizeFormat(".PNG")).toBe("png");
    expect(registry.normalizeFormat("  JPEG  ")).toBe("jpg");
    expect(registry.normalizeFormat(".TIFF")).toBe("tiff");
    expect(registry.normalizeFormat("YML")).toBe("yaml");
    expect(registry.normalizeFormat(" .png ")).toBe("png");
    expect(registry.normalizeFormat("..jpg")).toBe("jpg");
    expect(registry.normalizeFormat("webp.")).toBe("webp");
    expect(registry.normalizeFormat(" .gif. ")).toBe("gif");
  });

  it("should return valid targets for active adapters", async () => {
    registry.registerAdapter(new MockActiveImageAdapter());

    const result = await registry.getTargetsForSource("png");
    expect(result.sourceCapability?.format).toBe("png");
    expect(result.targets.length).toBe(2);
    expect(result.targets.map((t) => t.targetFormat)).toEqual(["jpg", "webp"]);
    expect(result.unavailableAdapters.length).toBe(0);
  });

  it("should return honest unavailable notices for inactive adapters without fake targets", async () => {
    registry.registerAdapter(new MockInactiveDocumentAdapter());

    const result = await registry.getTargetsForSource("docx");
    expect(result.sourceCapability?.format).toBe("docx");
    expect(result.targets.length).toBe(0);
    expect(result.unavailableAdapters.length).toBe(1);
    expect(result.unavailableAdapters[0]?.adapterId).toBe("mock-doc-adapter");
    expect(result.unavailableAdapters[0]?.setupInstructions).toContain("LibreOffice");
  });

  it("should find active adapter for a supported conversion pair", async () => {
    const adapter = new MockActiveImageAdapter();
    registry.registerAdapter(adapter);

    const found = await registry.findAdapterForPair("png", "jpg");
    expect(found).toBe(adapter);

    const notFound = await registry.findAdapterForPair("png", "unsupported");
    expect(notFound).toBeNull();
  });

  it("should not return inactive adapter when searching for conversion pair", async () => {
    registry.registerAdapter(new MockInactiveDocumentAdapter());

    const found = await registry.findAdapterForPair("docx", "pdf");
    expect(found).toBeNull();
  });

  it("should handle adapter isAvailable throwing an error gracefully", async () => {
    const faultAdapter: IConversionAdapter = {
      id: "faulty-adapter",
      name: "Faulty Adapter",
      category: "data",
      isAvailable: vi.fn().mockRejectedValue(new Error("Subprocess crash")),
      getSetupInstructions: () => "Perbaiki dependensi sistem.",
      getSupportedSources: () => ["json"],
      getSupportedTargets: async () => [],
      convert: vi.fn(),
    };

    registry.registerAdapter(faultAdapter);

    const result = await registry.getTargetsForSource("json");
    expect(result.targets.length).toBe(0);
    expect(result.unavailableAdapters.length).toBe(1);
    expect(result.unavailableAdapters[0]?.adapterId).toBe("faulty-adapter");
  });

  it("should generate comprehensive catalog response", async () => {
    registry.registerAdapter(new MockActiveImageAdapter());
    registry.registerAdapter(new MockInactiveDocumentAdapter());

    const catalog = await registry.getCatalogResponse();
    expect(catalog.status).toBe("ok");
    expect(catalog.totalAdapters).toBe(2);
    expect(catalog.totalActiveAdapters).toBe(1);
    expect(catalog.categories.image.active).toBe(true);
    expect(catalog.categories.document.active).toBe(false);
    expect(catalog.categories.document.setupInstructions).toContain("LibreOffice");
  });
});
