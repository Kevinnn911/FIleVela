// File: tests/unit/adapters.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import sharp from "sharp";
import { SharpImageAdapter } from "@/lib/adapters/sharp-image";
import { PureDataAdapter } from "@/lib/adapters/pure-data";
import { LibreOfficeDocumentAdapter } from "@/lib/adapters/libreoffice";
import { FFmpegMediaAdapter } from "@/lib/adapters/ffmpeg-media";

describe("Conversion Adapters Unit Tests", () => {
  const tmpDir = path.join(os.tmpdir(), `fileflow_adapters_${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("SharpImageAdapter", () => {
    const adapter = new SharpImageAdapter();

    it("should be available in node environment", async () => {
      const avail = await adapter.isAvailable();
      expect(avail).toBe(true);
    });

    it("should provide setup instructions", () => {
      expect(adapter.getSetupInstructions()).toContain("Sharp");
    });

    it("should return valid target formats for PNG", async () => {
      const targets = await adapter.getSupportedTargets("png");
      expect(targets.length).toBeGreaterThan(0);
      const formats = targets.map((t) => t.targetFormat);
      expect(formats).toContain("jpg");
      expect(formats).toContain("webp");
      expect(formats).not.toContain("png");
    });

    it("should convert real PNG to WebP", async () => {
      const inputPath = path.join(tmpDir, "test.png");
      const outputPath = path.join(tmpDir, "test.webp");

      await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 4,
          background: { r: 0, g: 255, b: 0, alpha: 1 },
        },
      })
        .png()
        .toFile(inputPath);

      const res = await adapter.convert(inputPath, outputPath, "png", "webp", {
        quality: 90,
      });

      expect(res.outputBytes).toBeGreaterThan(0);
      expect(res.mimeType).toBe("image/webp");
      expect(fs.existsSync(outputPath)).toBe(true);

      const meta = await sharp(outputPath).metadata();
      expect(meta.format).toBe("webp");
    });
  });

  describe("PureDataAdapter", () => {
    const adapter = new PureDataAdapter();

    it("should be available in all environments", async () => {
      expect(await adapter.isAvailable()).toBe(true);
    });

    it("should convert JSON to CSV and back to JSON", async () => {
      const inputJsonPath = path.join(tmpDir, "data.json");
      const outputCsvPath = path.join(tmpDir, "data.csv");
      const outputJsonPath = path.join(tmpDir, "back.json");

      const originalData = [
        { nama: "Budi", umur: "25", kota: "Jakarta" },
        { nama: "Siti", umur: "28", kota: "Surabaya" },
      ];

      fs.writeFileSync(inputJsonPath, JSON.stringify(originalData, null, 2), "utf-8");

      const csvRes = await adapter.convert(inputJsonPath, outputCsvPath, "json", "csv");
      expect(csvRes.outputBytes).toBeGreaterThan(0);
      expect(csvRes.mimeType).toBe("text/csv");

      const csvContent = fs.readFileSync(outputCsvPath, "utf-8");
      expect(csvContent).toContain("Budi");
      expect(csvContent).toContain("Surabaya");

      const jsonRes = await adapter.convert(outputCsvPath, outputJsonPath, "csv", "json");
      expect(jsonRes.outputBytes).toBeGreaterThan(0);

      const backContent = JSON.parse(fs.readFileSync(outputJsonPath, "utf-8"));
      expect(backContent).toEqual(originalData);
    });

    it("should convert JSON to YAML", async () => {
      const inputJsonPath = path.join(tmpDir, "config.json");
      const outputYamlPath = path.join(tmpDir, "config.yaml");

      fs.writeFileSync(inputJsonPath, JSON.stringify({ server: "localhost", port: 8080 }), "utf-8");

      const res = await adapter.convert(inputJsonPath, outputYamlPath, "json", "yaml");
      expect(res.outputBytes).toBeGreaterThan(0);
      expect(res.mimeType).toBe("application/x-yaml");

      const yamlContent = fs.readFileSync(outputYamlPath, "utf-8");
      expect(yamlContent).toContain("server: localhost");
      expect(yamlContent).toContain("port: 8080");
    });
  });

  describe("LibreOfficeDocumentAdapter & FFmpegMediaAdapter (Honest Status)", () => {
    it("should return honest instructions if LibreOffice is unconfigured", async () => {
      const adapter = new LibreOfficeDocumentAdapter();
      const instructions = adapter.getSetupInstructions();
      expect(instructions).toContain("LibreOffice");
      expect(adapter.getSupportedSources()).toContain("docx");
      expect(adapter.getSupportedSources()).toContain("pdf");
    });

    it("should return honest instructions if FFmpeg is unconfigured", async () => {
      const adapter = new FFmpegMediaAdapter();
      const instructions = adapter.getSetupInstructions();
      expect(instructions).toContain("FFmpeg");
      expect(adapter.getSupportedSources()).toContain("mp4");
      expect(adapter.getSupportedSources()).toContain("mp3");
    });
  });
});
