// File: tests/unit/downloader.test.ts

import { describe, it, expect } from "vitest";
import {
  validateSafeUrl,
  detectPlatform,
  extractMediaMetadata,
} from "@/lib/downloader/media-extractor";

describe("Social Media Downloader Extractor & Anti-SSRF", () => {
  describe("validateSafeUrl", () => {
    it("should reject empty or non-string URLs", () => {
      expect(validateSafeUrl("").valid).toBe(false);
      expect(validateSafeUrl("   ").valid).toBe(false);
    });

    it("should reject malicious local or private addresses (SSRF Guard)", () => {
      expect(validateSafeUrl("http://localhost/video").valid).toBe(false);
      expect(validateSafeUrl("http://127.0.0.1:8080/media").valid).toBe(false);
      expect(validateSafeUrl("http://192.168.1.1/secret").valid).toBe(false);
      expect(validateSafeUrl("http://10.0.0.1/private").valid).toBe(false);
      expect(validateSafeUrl("http://169.254.169.254/latest/meta-data").valid).toBe(false);
    });

    it("should reject non-HTTP schemes like file:// or gopher://", () => {
      expect(validateSafeUrl("file:///etc/passwd").valid).toBe(false);
      expect(validateSafeUrl("javascript:alert(1)").valid).toBe(false);
    });

    it("should accept valid public URLs", () => {
      const res = validateSafeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(res.valid).toBe(true);
      expect(res.url?.hostname).toBe("www.youtube.com");
    });
  });

  describe("detectPlatform", () => {
    it("should identify YouTube URLs", () => {
      const u1 = new URL("https://www.youtube.com/watch?v=12345");
      expect(detectPlatform(u1).platform).toBe("youtube");

      const u2 = new URL("https://youtu.be/abcdef");
      expect(detectPlatform(u2).platform).toBe("youtube");
    });

    it("should identify TikTok URLs", () => {
      const u = new URL("https://www.tiktok.com/@user/video/123456789");
      expect(detectPlatform(u).platform).toBe("tiktok");
    });

    it("should identify Instagram URLs", () => {
      const u = new URL("https://www.instagram.com/reel/Cx123456/");
      expect(detectPlatform(u).platform).toBe("instagram");
    });

    it("should identify X / Twitter URLs", () => {
      const u = new URL("https://x.com/user/status/987654321");
      expect(detectPlatform(u).platform).toBe("twitter");
    });
  });

  describe("extractMediaMetadata", () => {
    it("should parse YouTube URL and return available formats", async () => {
      const meta = await extractMediaMetadata("https://www.youtube.com/watch?v=testVideo123");
      expect(meta.platform).toBe("youtube");
      expect(meta.thumbnailUrl).toContain("testVideo123");
      expect(meta.availableFormats.length).toBeGreaterThan(0);
      expect(meta.availableFormats.some((f) => f.format === "mp4")).toBe(true);
      expect(meta.availableFormats.some((f) => f.format === "mp3")).toBe(true);
    });

    it("should parse TikTok URL and return options", async () => {
      const meta = await extractMediaMetadata("https://www.tiktok.com/@creator/video/999888");
      expect(meta.platform).toBe("tiktok");
      expect(meta.platformName).toBe("TikTok");
      expect(meta.availableFormats.length).toBe(4);
    });
  });
});

