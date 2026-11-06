// File: tests/unit/security-hardening.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import {
  ZipReader,
  isSafeZipEntryPath,
  MAX_COMPRESSION_RATIO,
} from "@/lib/document/zip-reader";
import { ZipWriter } from "@/lib/document/zip-writer";
import {
  validateSafeUrl,
  validateSafeUrlWithDns,
  isBlockedIpHost,
} from "@/lib/downloader/media-extractor";
import { markdownToHtml } from "@/lib/adapters/pure-data";
import { MAX_IMAGE_INPUT_PIXELS } from "@/lib/image/bmp-ico-codec";
import {
  checkRateLimit,
  resetRateLimiterStore,
  sanitizeJsonOptions,
  sanitizePublicErrorMessage,
} from "@/lib/security/rate-limiter";
import { LibreOfficeDocumentAdapter } from "@/lib/adapters/libreoffice";
import { generateOwnerToken } from "@/lib/security/token-auth";
import {
  getJobDir,
  initJobDirectory,
  writeJobMeta,
  deleteJobDirectory,
  JobMetadata,
} from "@/lib/storage/temp-storage";
import { GET as downloadRouteGet } from "@/app/api/jobs/[id]/download/route";
import { POST as batchZipPost } from "@/app/api/jobs/batch-zip/route";

describe("Security Hardening Suite (SEC-01 to SEC-07)", () => {
  beforeEach(() => {
    resetRateLimiterStore();
  });

  describe("SEC-01: Zip Slip & Decompression Bomb Protection (ZipReader)", () => {
    it("menolak path Zip Slip (directory traversal, absolute path, drive letter, null byte)", () => {
      expect(isSafeZipEntryPath("../evil.txt")).toBe(false);
      expect(isSafeZipEntryPath("word/../../etc/passwd")).toBe(false);
      expect(isSafeZipEntryPath("/etc/passwd")).toBe(false);
      expect(isSafeZipEntryPath("\\Windows\\System32\\cmd.exe")).toBe(false);
      expect(isSafeZipEntryPath("C:\\Windows\\win.ini")).toBe(false);
      expect(isSafeZipEntryPath("word/document.xml\0.exe")).toBe(false);
      expect(isSafeZipEntryPath("a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q/r.xml")).toBe(false);

      expect(isSafeZipEntryPath("word/document.xml")).toBe(true);
      expect(isSafeZipEntryPath("[Content_Types].xml")).toBe(true);
      expect(isSafeZipEntryPath("xl/worksheets/sheet1.xml")).toBe(true);
    });

    it("mengabaikan entri berbahaya di dalam arsip ZIP namun tetap mengekstrak entri aman", () => {
      const writer = new ZipWriter();
      writer.addFile("../traversal.txt", "evil-payload");
      writer.addFile("/abs/path.txt", "evil-abs");
      writer.addFile("word/document.xml", "<w:document>Aman</w:document>");

      const reader = new ZipReader(writer.toBuffer());
      const names = reader.listFiles();

      expect(names).not.toContain("../traversal.txt");
      expect(names).not.toContain("/abs/path.txt");
      expect(names).toContain("word/document.xml");
      expect(reader.readText("word/document.xml")).toContain("Aman");
    });

    it("menghentikan dekompresi ketika rasio kompresi melebihi batas aman (Zip Bomb Guard)", () => {
      const highlyRepetitivePayload = Buffer.alloc(300 * 1024, "A");
      const writer = new ZipWriter();
      writer.addFile("bomb.txt", highlyRepetitivePayload, true);

      const reader = new ZipReader(writer.toBuffer());
      expect(MAX_COMPRESSION_RATIO).toBeLessThanOrEqual(120);
      expect(reader.readFile("bomb.txt")).toBeNull();
    });
  });

  describe("SEC-02: SSRF, DNS Rebinding, & CLI Option Injection Protection", () => {
    it("memblokir host loopback, private RFC1918, link-local metadata, dan IPv6 lokal", () => {
      expect(isBlockedIpHost("127.0.0.1")).toBe(true);
      expect(isBlockedIpHost("10.0.0.1")).toBe(true);
      expect(isBlockedIpHost("172.16.5.4")).toBe(true);
      expect(isBlockedIpHost("192.168.1.1")).toBe(true);
      expect(isBlockedIpHost("169.254.169.254")).toBe(true);
      expect(isBlockedIpHost("::1")).toBe(true);
      expect(isBlockedIpHost("::ffff:127.0.0.1")).toBe(true);
      expect(isBlockedIpHost("93.184.216.34")).toBe(false);
    });

    it("menolak skema non-HTTP(S), kredensial URL, dan injeksi argumen CLI (-o)", () => {
      const fileScheme = validateSafeUrl("file:///etc/passwd");
      expect(fileScheme.valid).toBe(false);
      expect(fileScheme.error).toMatch(/protokol/i);

      const cliArg = validateSafeUrl("-o /tmp/evil.sh");
      expect(cliArg.valid).toBe(false);
      expect(cliArg.error).toMatch(/SSRF|tidak valid/i);

      const credUrl = validateSafeUrl("http://admin:secret@example.com/video.mp4");
      expect(credUrl.valid).toBe(false);
      expect(credUrl.error).toMatch(/kredensial/i);

      const metaUrl = validateSafeUrl("http://169.254.169.254/latest/meta-data/");
      expect(metaUrl.valid).toBe(false);
      expect(metaUrl.error).toMatch(/SSRF/i);
    });

    it("memblokir simulasi DNS Rebinding yang mengarah ke IP internal/loopback", async () => {
      const loopbackRebind = await validateSafeUrlWithDns(
        "https://rebind-test.example.com/media.mp4",
        {
          customLookup: async () => [{ address: "127.0.0.1" }],
        }
      );
      expect(loopbackRebind.valid).toBe(false);
      expect(loopbackRebind.error).toMatch(/DNS Rebinding|SSRF/i);

      const metadataRebind = await validateSafeUrlWithDns(
        "https://metadata-rebind.example.com/video",
        {
          customLookup: async () => [{ address: "169.254.169.254" }],
        }
      );
      expect(metadataRebind.valid).toBe(false);
      expect(metadataRebind.error).toMatch(/DNS Rebinding|SSRF/i);

      const safeParsed = await validateSafeUrlWithDns(
        "https://public-media.example.com/video.mp4",
        {
          customLookup: async () => [{ address: "93.184.216.34" }],
        }
      );
      expect(safeParsed.valid).toBe(true);
      expect(safeParsed.url?.hostname).toBe("public-media.example.com");
    });
  });

  describe("SEC-03: Download Security Headers & Anti-Sniffing", () => {
    it("menyertakan header anti-sniffing, CSP sandbox, dan CORP pada endpoint unduh", async () => {
      const jobId = crypto.randomUUID();
      const { token, hash } = generateOwnerToken();
      await initJobDirectory(jobId);

      try {
        const jobDir = getJobDir(jobId);
        const outputFilename = "hasil-uji.txt";
        await fs.promises.writeFile(
          path.join(jobDir, "output", outputFilename),
          "Data aman FileVela",
          "utf8"
        );

        const now = new Date();
        const meta: JobMetadata = {
          jobId,
          ownerTokenHash: hash,
          status: "succeeded",
          sourceFormat: "txt",
          targetFormat: "txt",
          originalFilename: "input.txt",
          inputFilename: "input.txt",
          outputFilename,
          inputSizeBytes: 18,
          outputSizeBytes: 18,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 60_000).toISOString(),
        };
        await writeJobMeta(jobId, meta);

        const req = new NextRequest(
          `http://localhost:3000/api/jobs/${jobId}/download?token=${token}`
        );
        const res = await downloadRouteGet(req, { params: { id: jobId } });

        expect(res.status).toBe(200);
        expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
        expect(res.headers.get("X-Frame-Options")).toBe("DENY");
        expect(res.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
        expect(res.headers.get("Content-Security-Policy")).toContain("sandbox");
        expect(res.headers.get("Content-Disposition")).toContain("attachment;");
      } finally {
        await deleteJobDirectory(jobId);
      }
    });
  });

  describe("SEC-04: Markdown XSS Escaping & Image Pixel Limit", () => {
    it("melakukan escape tag HTML berbahaya dan menetralkan skema javascript:/data: pada Markdown", () => {
      const maliciousMarkdown = [
        "# Judul Aman",
        "<script>alert('xss')</script>",
        "<img src=x onerror=alert(1)>",
        "[Tautan Jahat](javascript:alert(document.cookie))",
        "[Tautan Data](data:text/html,<script>alert(1)</script>)",
        "[Tautan Resmi](https://filevela.app/docs)",
      ].join("\n\n");

      const html = markdownToHtml(maliciousMarkdown);

      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
      expect(html).not.toContain("<img src=x");
      expect(html).not.toContain("javascript:");
      expect(html).not.toContain("data:text/html");
      expect(html).toContain('href="#"');
      expect(html).toContain('href="https://filevela.app/docs"');
    });

    it("membatasi MAX_IMAGE_INPUT_PIXELS pada batas aman 67.108.864 piksel (8192x8192)", () => {
      expect(MAX_IMAGE_INPUT_PIXELS).toBe(67_108_864);
    });
  });

  describe("SEC-05: Rate Limiter & Batch-Zip Bounds", () => {
    it("memblokir semburan request yang melampaui kuota per-IP saat forceEnforce aktif", () => {
      const makeRequest = () =>
        new NextRequest("http://localhost:3000/api/jobs", {
          headers: { "x-forwarded-for": "203.0.113.77" },
        });

      const first = checkRateLimit(makeRequest(), {
        bucket: "test:burst",
        maxRequests: 2,
        windowMs: 60_000,
        forceEnforce: true,
      });
      const second = checkRateLimit(makeRequest(), {
        bucket: "test:burst",
        maxRequests: 2,
        windowMs: 60_000,
        forceEnforce: true,
      });
      const third = checkRateLimit(makeRequest(), {
        bucket: "test:burst",
        maxRequests: 2,
        windowMs: 60_000,
        forceEnforce: true,
      });

      expect(first.allowed).toBe(true);
      expect(second.allowed).toBe(true);
      expect(third.allowed).toBe(false);
      expect(third.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("menolak permintaan batch-zip yang melebihi batas 100 item", async () => {
      const oversizedItems = Array.from({ length: 101 }, (_, idx) => ({
        jobId: crypto.randomUUID(),
        token: `token_${idx}`,
      }));

      const req = new NextRequest("http://localhost:3000/api/jobs/batch-zip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: oversizedItems }),
      });

      const res = await batchZipPost(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.code).toBe("TOO_MANY_BATCH_ITEMS");
    });
  });

  describe("SEC-06: Subprocess Format Allowlist", () => {
    it("menolak format target tidak sah pada LibreOfficeDocumentAdapter sebelum mengeksekusi proses", async () => {
      const adapter = new LibreOfficeDocumentAdapter();
      await expect(
        adapter.convert("input.docx", "output.exe", "docx", "exe")
      ).rejects.toThrow(/Format target dokumen tidak diizinkan/i);
    });
  });

  describe("SEC-07: Prototype Pollution Filter & Path Redaction", () => {
    it("menyaring properti __proto__, constructor, dan prototype dari objek JSON", () => {
      const rawJson = JSON.parse(
        '{"quality":85,"__proto__":{"polluted":true},"constructor":{"prototype":{"pwn":1}}}'
      ) as Record<string, unknown>;
      const sanitized = sanitizeJsonOptions(rawJson);

      expect(sanitized).toBeDefined();
      expect(sanitized?.quality).toBe(85);
      expect(
        Object.prototype.hasOwnProperty.call(sanitized ?? {}, "__proto__")
      ).toBe(false);
      expect(
        Object.prototype.hasOwnProperty.call(sanitized ?? {}, "constructor")
      ).toBe(false);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it("menyensor path sistem file internal Windows dan POSIX pada pesan galat publik", () => {
      const rawWinError =
        "ENOENT: no such file or directory, open 'C:\\Best Project\\Open\\.storage\\jobs\\123\\input\\rahasia.pdf'";
      const sanitizedWin = sanitizePublicErrorMessage(rawWinError, "Fallback error");

      expect(sanitizedWin).not.toContain("C:\\Best Project");
      expect(sanitizedWin).not.toContain(".storage");
      expect(sanitizedWin).toContain("[jalur-internal]");

      const rawPosixError =
        "Failed reading /var/app/.storage/jobs/abc-123/output/dokumen.pdf";
      const sanitizedPosix = sanitizePublicErrorMessage(rawPosixError, "Fallback error");

      expect(sanitizedPosix).not.toContain("/var/app");
      expect(sanitizedPosix).toContain("[jalur-internal]");
    });
  });
});
