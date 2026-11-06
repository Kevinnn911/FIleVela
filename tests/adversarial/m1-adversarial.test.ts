// File: tests/adversarial/m1-adversarial.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";
import {
  generateOwnerToken,
  verifyOwnerToken,
  extractTokenFromRequest,
} from "@/lib/security/token-auth";
import { CapabilityRegistry } from "@/lib/adapters/registry";
import {
  ConversionResult,
  ConversionTarget,
  FileCategory,
  IConversionAdapter,
} from "@/lib/adapters/types";
import { GET as capabilitiesHandler } from "@/app/api/capabilities/route";
import { GET as healthHandler } from "@/app/api/health/route";

// ---------------------------------------------------------------------------
// Mock Adapters for Adversarial Testing
// ---------------------------------------------------------------------------

class FlakyCrashingAdapter implements IConversionAdapter {
  public readonly id = "flaky-crashing-adapter";
  public readonly name = "Flaky Crashing Adapter";
  public readonly category: FileCategory = "data";
  public callCount = 0;

  public async isAvailable(): Promise<boolean> {
    this.callCount++;
    throw new Error("Simulated subprocess crash: SIGSEGV (signal 11)");
  }

  public getSetupInstructions(): string {
    return "Pasang ulang runtime sistem untuk memperbaiki adapter rusak.";
  }

  public getSupportedSources(): string[] {
    return ["json", "csv"];
  }

  public async getSupportedTargets(): Promise<ConversionTarget[]> {
    throw new Error("Should never be called when isAvailable() fails");
  }

  public async convert(): Promise<ConversionResult> {
    throw new Error("Cannot convert with crashing adapter");
  }
}

class InactiveLibreOfficeAdapter implements IConversionAdapter {
  public readonly id = "mock-libreoffice-inactive";
  public readonly name = "Mock Inactive LibreOffice Adapter";
  public readonly category: FileCategory = "document";

  public async isAvailable(): Promise<boolean> {
    return false;
  }

  public getSetupInstructions(): string {
    return "Pasang LibreOffice dan pastikan executable 'soffice' tersedia pada PATH sistem.";
  }

  public getSupportedSources(): string[] {
    return ["docx", "odt", "rtf"];
  }

  public async getSupportedTargets(): Promise<ConversionTarget[]> {
    // Adversarial: adapter attempts to deceptively return targets even if inactive
    return [
      {
        targetFormat: "pdf",
        label: "PDF Document",
        mimeType: "application/pdf",
        adapterId: this.id,
        isAvailable: true, // deceptive claim!
      },
    ];
  }

  public async convert(): Promise<ConversionResult> {
    throw new Error("Deceptive convert call attempted on inactive adapter");
  }
}

class ActivePartialTargetsAdapter implements IConversionAdapter {
  public readonly id = "mock-active-partial";
  public readonly name = "Mock Active Partial Adapter";
  public readonly category: FileCategory = "image";
  public checkCount = 0;

  public async isAvailable(): Promise<boolean> {
    this.checkCount++;
    // Small artificial delay to simulate async I/O or CLI probe
    await new Promise((resolve) => setTimeout(resolve, 5));
    return true;
  }

  public getSetupInstructions(): string {
    return "Siap digunakan.";
  }

  public getSupportedSources(): string[] {
    return ["png", "jpg"];
  }

  public async getSupportedTargets(sourceFormat: string): Promise<ConversionTarget[]> {
    if (sourceFormat === "png") {
      return [
        {
          targetFormat: "webp",
          label: "WebP Image",
          mimeType: "image/webp",
          adapterId: this.id,
          isAvailable: true,
        },
        {
          targetFormat: "avif",
          label: "AVIF Image (Unconfigured)",
          mimeType: "image/avif",
          adapterId: this.id,
          isAvailable: false, // Inactive sub-feature
          statusReason: "libheif / avif codec missing",
        },
        {
          targetFormat: "png", // Same format without options
          label: "PNG Image",
          mimeType: "image/png",
          adapterId: this.id,
          isAvailable: true,
        },
        {
          targetFormat: "jpg",
          label: "JPEG Image with Quality",
          mimeType: "image/jpeg",
          adapterId: this.id,
          isAvailable: true,
          optionsSchema: {
            quality: { name: "quality", label: "Kualitas", type: "number", default: 80 },
          },
        },
      ];
    }
    if (sourceFormat === "jpg") {
      return [
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
    _input: string,
    output: string,
    _src: string,
    tgt: string
  ): Promise<ConversionResult> {
    return {
      outputBytes: 4096,
      mimeType: `image/${tgt}`,
      outputPath: output,
      durationMs: 25,
    };
  }
}

// ---------------------------------------------------------------------------
// TEST SUITE: Adversarial Milestone 1 Challenge
// ---------------------------------------------------------------------------

describe("Milestone 1 Adversarial Challenge Suite", () => {
  // =========================================================================
  // 1. Token Authentication Stress & Side-Channel Resistance
  // =========================================================================
  describe("1. Token Authentication Adversarial Stress", () => {
    it("should resist brute-force attacks across 5,000 random candidate tokens", () => {
      const { hash } = generateOwnerToken();
      let collisions = 0;

      for (let i = 0; i < 5000; i++) {
        const candidate = crypto.randomBytes(32).toString("hex");
        if (verifyOwnerToken(candidate, hash)) {
          collisions++;
        }
      }

      expect(collisions).toBe(0);
    });

    it("should reject edge-case candidate token formats cleanly without throwing", () => {
      const { hash } = generateOwnerToken();

      const malformedCandidates = [
        "",
        "   ",
        "\t\n\r",
        "a",
        "f".repeat(63), // 63 chars (1 short)
        "f".repeat(65), // 65 chars (1 too long)
        "0".repeat(63) + "g", // non-hex char 'g'
        "0".repeat(63) + "Z", // non-hex char 'Z'
        "0".repeat(63) + " ", // whitespace in token
        "0".repeat(63) + "\0", // null byte in token
        "\uD83D\uDE80".repeat(16), // surrogate pair unicode escape test (formerly literal emoji)
        "EMOJI_SUBSTITUTE_NON_HEX_TEST_STRING_".padEnd(64, "X"),
        "../".repeat(16), // directory traversal
        "' OR '1'='1", // SQL injection payload
        "<script>alert(1)</script>", // XSS payload
        null,
        undefined,
        12345 as unknown as string,
        {} as unknown as string,
        [] as unknown as string,
      ];

      for (const candidate of malformedCandidates) {
        expect(verifyOwnerToken(candidate, hash)).toBe(false);
      }
    });

    it("should handle corrupted string storedHash safely without crashing", () => {
      const { token } = generateOwnerToken();

      const corruptedHashes = [
        "",
        "short",
        "g".repeat(64), // invalid hex
        "123", // odd length hex
        "0".repeat(32), // 16 bytes instead of 32
        "0".repeat(128), // 64 bytes instead of 32
      ];

      for (const badHash of corruptedHashes) {
        expect(verifyOwnerToken(token, badHash)).toBe(false);
      }
    });

    it("should safely return false without throwing when storedHash is missing, null, or undefined", () => {
      const { token } = generateOwnerToken();

      expect(verifyOwnerToken(token, undefined as unknown as string)).toBe(false);
      expect(verifyOwnerToken(token, null as unknown as string)).toBe(false);
      expect(verifyOwnerToken(token, "")).toBe(false);
      expect(verifyOwnerToken(token, 12345 as unknown as string)).toBe(false);
    });

    it("should enforce multi-channel extraction priority (X-Session-Token > X-Job-Token > Bearer > ?token=)", () => {
      const tokenSession = "1".repeat(64);
      const tokenJob = "2".repeat(64);
      const tokenBearer = "3".repeat(64);
      const tokenQuery = "4".repeat(64);

      // Scenario A: All 4 channels present -> X-Session-Token wins
      const reqAll = new Request(
        `http://localhost:3000/api/jobs/123/download?token=${tokenQuery}`,
        {
          headers: {
            "x-session-token": tokenSession,
            "x-job-token": tokenJob,
            authorization: `Bearer ${tokenBearer}`,
          },
        }
      );
      expect(extractTokenFromRequest(reqAll)).toBe(tokenSession);

      // Scenario B: X-Job-Token + Bearer + Query -> X-Job-Token wins
      const reqNoSession = new Request(
        `http://localhost:3000/api/jobs/123/download?token=${tokenQuery}`,
        {
          headers: {
            "x-job-token": tokenJob,
            authorization: `Bearer ${tokenBearer}`,
          },
        }
      );
      expect(extractTokenFromRequest(reqNoSession)).toBe(tokenJob);

      // Scenario C: Bearer + Query -> Bearer wins
      const reqBearerQuery = new Request(
        `http://localhost:3000/api/jobs/123/download?token=${tokenQuery}`,
        {
          headers: {
            authorization: `Bearer ${tokenBearer}`,
          },
        }
      );
      expect(extractTokenFromRequest(reqBearerQuery)).toBe(tokenBearer);

      // Scenario D: Only Query
      const reqQueryOnly = new Request(
        `http://localhost:3000/api/jobs/123/download?token=${tokenQuery}`
      );
      expect(extractTokenFromRequest(reqQueryOnly)).toBe(tokenQuery);
    });

    it("should gracefully fall through when higher-priority header contains malformed token", () => {
      const validBearerToken = "a".repeat(64);

      // X-Session-Token is malformed -> fall through to valid Bearer
      const req = new Request("http://localhost:3000/api/jobs/123", {
        headers: {
          "x-session-token": "bad-short-token",
          authorization: `Bearer ${validBearerToken}`,
        },
      });

      expect(extractTokenFromRequest(req)).toBe(validBearerToken);
    });

    it("should accept RFC 7235 case-insensitive Bearer scheme (lowercase 'bearer')", () => {
      const validToken = "a".repeat(64);

      const reqLowercase = new Request("http://localhost:3000/api/jobs/123", {
        headers: {
          authorization: `bearer ${validToken}`,
        },
      });

      expect(extractTokenFromRequest(reqLowercase)).toBe(validToken);
    });

    it("should ignore query param when URL has malformed tokens", () => {
      const reqMalformedQuery = new Request(
        "http://localhost:3000/api/jobs/123?token=invalid_not_hex_64"
      );
      expect(extractTokenFromRequest(reqMalformedQuery)).toBeNull();
    });
  });

  // =========================================================================
  // 2. Adapter Registry & Anti-Deception
  // =========================================================================
  describe("2. Adapter Registry & Anti-Deception Stress", () => {
    let registry: CapabilityRegistry;

    beforeEach(() => {
      CapabilityRegistry.resetInstance();
      registry = CapabilityRegistry.getInstance();
      registry.setCacheTtlMs(100); // 100ms TTL for testing
    });

    it("should NEVER return targets for an inactive adapter, even if adapter claims targets internally", async () => {
      registry.registerAdapter(new InactiveLibreOfficeAdapter());

      const result = await registry.getTargetsForSource("docx");

      // Anti-deception: targets must be completely empty
      expect(result.targets).toEqual([]);
      expect(result.unavailableAdapters.length).toBe(1);
      expect(result.unavailableAdapters[0]?.adapterId).toBe("mock-libreoffice-inactive");
      expect(result.unavailableAdapters[0]?.setupInstructions).toContain("LibreOffice");

      // Verify findAdapterForPair also returns null
      const adapter = await registry.findAdapterForPair("docx", "pdf");
      expect(adapter).toBeNull();

      // Verify executeConversion throws immediately
      await expect(
        registry.executeConversion("in.docx", "out.pdf", "docx", "pdf")
      ).rejects.toThrow(/Tidak ada adapter aktif/);
    });

    it("should filter out individual inactive targets and no-op same-format targets", async () => {
      registry.registerAdapter(new ActivePartialTargetsAdapter());

      const result = await registry.getTargetsForSource("png");

      const targetFormats = result.targets.map((t) => t.targetFormat);

      // 'webp' is active -> must be present
      expect(targetFormats).toContain("webp");

      // 'jpg' is active with options -> must be present
      expect(targetFormats).toContain("jpg");

      // 'avif' was marked isAvailable: false -> MUST be excluded
      expect(targetFormats).not.toContain("avif");

      // 'png' without options -> MUST be excluded (no-op conversion)
      expect(targetFormats).not.toContain("png");
    });

    it("should handle crashing/throwing adapters gracefully without breaking other queries", async () => {
      registry.registerAdapter(new FlakyCrashingAdapter());
      registry.registerAdapter(new ActivePartialTargetsAdapter());

      // Query for format supported by crashing adapter
      const crashResult = await registry.getTargetsForSource("json");
      expect(crashResult.targets).toEqual([]);
      expect(crashResult.unavailableAdapters.length).toBe(1);
      expect(crashResult.unavailableAdapters[0]?.adapterId).toBe("flaky-crashing-adapter");

      // Other adapter should still function smoothly
      const healthyResult = await registry.getTargetsForSource("png");
      expect(healthyResult.targets.length).toBeGreaterThan(0);
    });

    it("should return clean empty results for unsupported formats without throwing", async () => {
      registry.registerAdapter(new ActivePartialTargetsAdapter());

      const result = await registry.getTargetsForSource("completely_unknown_xyz");
      expect(result.sourceCapability).toBeNull();
      expect(result.targets).toEqual([]);
      expect(result.unavailableAdapters).toEqual([]);
    });

    it("coalesces concurrent requests and prevents cache stampede during concurrent bursts", async () => {
      const activeAdapter = new ActivePartialTargetsAdapter();
      registry.registerAdapter(activeAdapter);
      registry.registerAdapter(new InactiveLibreOfficeAdapter());

      // Fire 50 simultaneous queries before cache is populated
      const promises = Array.from({ length: 50 }, () =>
        registry.getTargetsForSource("png")
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(50);
      for (const res of results) {
        expect(res.targets.map((t) => t.targetFormat)).toEqual(["webp", "jpg"]);
      }

      // Coalescing in-flight requests ensures only 1 execution occurs
      expect(activeAdapter.checkCount).toBe(1);
    });

    it("demonstrates that subsequent sequential calls properly utilize availability cache", async () => {
      const adapter = new ActivePartialTargetsAdapter();
      registry.registerAdapter(adapter);
      registry.setCacheTtlMs(100);

      // First query populates cache
      await registry.getTargetsForSource("png");
      const initialCount = adapter.checkCount;
      expect(initialCount).toBe(1);

      // Next 20 sequential calls reuse cache
      for (let i = 0; i < 20; i++) {
        await registry.getTargetsForSource("png");
      }
      expect(adapter.checkCount).toBe(1);
    });

    it("should refresh availability cache when TTL expires", async () => {
      const adapter = new ActivePartialTargetsAdapter();
      registry.registerAdapter(adapter);
      registry.setCacheTtlMs(50); // 50ms TTL

      await registry.getTargetsForSource("png");
      const firstCheckCount = adapter.checkCount;
      expect(firstCheckCount).toBe(1);

      // Immediate second call should use cache
      await registry.getTargetsForSource("png");
      expect(adapter.checkCount).toBe(firstCheckCount);

      // Wait 70ms for TTL expiration
      await new Promise((resolve) => setTimeout(resolve, 70));

      // Third call should re-check availability
      await registry.getTargetsForSource("png");
      expect(adapter.checkCount).toBeGreaterThan(firstCheckCount);
    });
  });

  // =========================================================================
  // 3. API Route Handler Robustness
  // =========================================================================
  describe("3. API Route Handler Robustness", () => {
    beforeEach(() => {
      CapabilityRegistry.resetInstance();
      const registry = CapabilityRegistry.getInstance();
      registry.setCacheTtlMs(0);
      registry.registerAdapter(new ActivePartialTargetsAdapter());
      registry.registerAdapter(new InactiveLibreOfficeAdapter());
    });

    describe("GET /api/capabilities Adversarial Input Fuzzing", () => {
      it("should reject path traversal attempts with 400 and INVALID_SOURCE_FORMAT", async () => {
        const traversalPayloads = [
          "../../../",
          "..\\..\\..\\",
          "..%2f..%2f",
          "../../etc/passwd",
          "../../../windows/win.ini",
          "png/../../",
        ];

        for (const payload of traversalPayloads) {
          const req = new NextRequest(
            `http://localhost:3000/api/capabilities?source=${encodeURIComponent(payload)}`
          );
          const res = await capabilitiesHandler(req);
          const json = await res.json();

          expect(res.status).toBe(400);
          expect(json.code).toBe("INVALID_SOURCE_FORMAT");
          expect(json.error).toBeDefined();
        }
      });

      it("should reject null byte and control character injections with 400", async () => {
        const maliciousPayloads = [
          "%00",
          "png%00",
          "png\x00",
          "png%0aSet-Cookie:evil",
          "png%0d%0a",
          "<script>alert(1)</script>",
          "png;rm -rf /",
          "png|calc.exe",
          "png`id`",
        ];

        for (const payload of maliciousPayloads) {
          const req = new NextRequest(
            `http://localhost:3000/api/capabilities?source=${encodeURIComponent(payload)}`
          );
          const res = await capabilitiesHandler(req);
          const json = await res.json();

          expect(res.status).toBe(400);
          expect(json.code).toBe("INVALID_SOURCE_FORMAT");
        }
      });

      it("should reject oversized format parameter (>20 chars) with 400", async () => {
        const oversized = "a".repeat(100);
        const req = new NextRequest(
          `http://localhost:3000/api/capabilities?source=${oversized}`
        );
        const res = await capabilitiesHandler(req);
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json.code).toBe("INVALID_SOURCE_FORMAT");
      });

      it("should return 400 with SOURCE_NOT_SUPPORTED for valid syntax but unknown format", async () => {
        const req = new NextRequest(
          "http://localhost:3000/api/capabilities?source=invalid_format_xyz"
        );
        const res = await capabilitiesHandler(req);
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json.code).toBe("SOURCE_NOT_SUPPORTED");
        expect(json.message).toContain("invalid_format_xyz");
        expect(Array.isArray(json.supportedFormats)).toBe(true);
      });

      it("should return HTTP 400 SOURCE_NOT_SUPPORTED when format has 0 active targets and 0 inactive adapters", async () => {
        // 'yaml' (and alias 'yml') is in KNOWN_FORMAT_CATALOG, but has 0 active adapters and 0 inactive adapters in M1
        const reqYml = new NextRequest("http://localhost:3000/api/capabilities?source=yml");
        const resYml = await capabilitiesHandler(reqYml);
        const jsonYml = await resYml.json();

        expect(resYml.status).toBe(400);
        expect(jsonYml.code).toBe("SOURCE_NOT_SUPPORTED");
        expect(jsonYml.error).toContain("Format sumber belum didukung");
      });

      it("should handle valid format edge cases (leading dot, uppercase, whitespace, aliases)", async () => {
        // Leading dot and uppercase
        const reqDot = new NextRequest("http://localhost:3000/api/capabilities?source=.PNG");
        const resDot = await capabilitiesHandler(reqDot);
        const jsonDot = await resDot.json();
        expect(resDot.status).toBe(200);
        expect(jsonDot.source.format).toBe("png");

        // Format alias: 'jpeg' -> 'jpg'
        const reqJpeg = new NextRequest("http://localhost:3000/api/capabilities?source=jpeg");
        const resJpeg = await capabilitiesHandler(reqJpeg);
        const jsonJpeg = await resJpeg.json();
        expect(resJpeg.status).toBe(200);
        expect(jsonJpeg.source.format).toBe("jpg");
      });

      it("should return honest 200 with 0 targets and setup instructions when format is known but adapter inactive", async () => {
        const req = new NextRequest("http://localhost:3000/api/capabilities?source=docx");
        const res = await capabilitiesHandler(req);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.source.format).toBe("docx");
        expect(json.targets).toEqual([]);
        expect(json.unavailableAdapters).toHaveLength(1);
        expect(json.unavailableAdapters[0].adapterId).toBe("mock-libreoffice-inactive");
        expect(json.unavailableAdapters[0].setupInstructions).toContain("LibreOffice");
      });

      it("should return full catalog with 200 when source parameter is omitted or empty", async () => {
        const reqEmpty = new NextRequest("http://localhost:3000/api/capabilities?source=");
        const resEmpty = await capabilitiesHandler(reqEmpty);
        const jsonEmpty = await resEmpty.json();

        expect(resEmpty.status).toBe(200);
        expect(jsonEmpty.status).toBe("ok");
        expect(jsonEmpty.categories).toBeDefined();
        expect(jsonEmpty.totalAdapters).toBe(2);
      });
    });

    describe("GET /api/health Robustness", () => {
      it("should return 200 with full health metrics when adapters are healthy/partially active", async () => {
        const res = await healthHandler();
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.status).toBe("healthy");
        expect(json.service).toBe("FileFlow");
        expect(json.version).toBe("1.0.0");
        expect(typeof json.uptimeSeconds).toBe("number");
        expect(json.system.platform).toBe(process.platform);
        expect(json.adapters.total).toBe(2);
        expect(json.adapters.active).toBe(1);
        expect(json.adapters.inactive).toBe(1);
        expect(json.storage.status).toBe("ready");
      });

      it("should return 200 with degraded status when all registered adapters are inactive", async () => {
        CapabilityRegistry.resetInstance();
        const registry = CapabilityRegistry.getInstance();
        registry.registerAdapter(new InactiveLibreOfficeAdapter());

        const res = await healthHandler();
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.status).toBe("degraded");
        expect(json.adapters.total).toBe(1);
        expect(json.adapters.active).toBe(0);
        expect(json.adapters.inactive).toBe(1);
      });

      it("should return no-store cache control headers on health check", async () => {
        const res = await healthHandler();
        const cacheControl = res.headers.get("Cache-Control");
        expect(cacheControl).toContain("no-store");
      });
    });
  });
});
