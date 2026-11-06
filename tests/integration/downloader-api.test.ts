// File: tests/integration/downloader-api.test.ts

import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST as extractHandler } from "@/app/api/downloader/extract/route";
import { GET as downloadHandler } from "@/app/api/downloader/download/route";

describe("Downloader API Integration Tests", () => {
  describe("POST /api/downloader/extract", () => {
    it("should reject missing or empty URL", async () => {
      const req = new NextRequest("http://localhost:3000/api/downloader/extract", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const res = await extractHandler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("MISSING_URL");
    });

    it("should reject malicious SSRF URL", async () => {
      const req = new NextRequest("http://localhost:3000/api/downloader/extract", {
        method: "POST",
        body: JSON.stringify({ url: "http://127.0.0.1:8000/admin" }),
      });

      const res = await extractHandler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("EXTRACTION_FAILED");
    });

    it("should extract metadata for a valid YouTube URL", async () => {
      const req = new NextRequest("http://localhost:3000/api/downloader/extract", {
        method: "POST",
        body: JSON.stringify({ url: "https://www.youtube.com/watch?v=sample123" }),
      });

      const res = await extractHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.metadata.platform).toBe("youtube");
      expect(json.metadata.availableFormats.length).toBeGreaterThan(0);
    });
  });

  describe("GET /api/downloader/download", () => {
    it("should return valid MP4 stream with proper headers", async () => {
      const targetUrl = "https://www.youtube.com/watch?v=sample123";
      const req = new NextRequest(
        `http://localhost:3000/api/downloader/download?url=${encodeURIComponent(
          targetUrl
        )}&format=mp4&title=Sample_Video`
      );

      const res = await downloadHandler(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("video/mp4");
      expect(res.headers.get("Content-Disposition")).toContain("Sample_Video.mp4");

      const buffer = Buffer.from(await res.arrayBuffer());
      expect(buffer.length).toBeGreaterThan(0);
      // ftyp signature
      expect(buffer.subarray(4, 8).toString("ascii")).toBe("ftyp");
    });

    it("should return valid MP3 stream with proper ID3 headers", async () => {
      const targetUrl = "https://www.tiktok.com/@user/video/123";
      const req = new NextRequest(
        `http://localhost:3000/api/downloader/download?url=${encodeURIComponent(
          targetUrl
        )}&format=mp3&title=Sample_Audio`
      );

      const res = await downloadHandler(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
      expect(res.headers.get("Content-Disposition")).toContain("Sample_Audio.mp3");

      const buffer = Buffer.from(await res.arrayBuffer());
      // ID3 tag
      expect(buffer[0]).toBe(0x49); // 'I'
      expect(buffer[1]).toBe(0x44); // 'D'
      expect(buffer[2]).toBe(0x33); // '3'
    });
  });
});

