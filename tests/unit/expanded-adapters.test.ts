// File: tests/unit/expanded-adapters.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import sharp from "sharp";
import { SharpImageAdapter } from "@/lib/adapters/sharp-image";
import { PureDataAdapter } from "@/lib/adapters/pure-data";
import { SharpLocalBgRemovalProvider } from "@/lib/bg-removal/sharp-local-provider";

describe("Expanded Adapters & Background Replacement Tests", () => {
  const tmpDir = path.join(os.tmpdir(), `fileflow_expanded_${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    sharp.cache(false);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("SVG & ICO Conversion via SharpImageAdapter", () => {
    const adapter = new SharpImageAdapter();

    it("should convert SVG to raster PNG", async () => {
      const svgPath = path.join(tmpDir, "logo.svg");
      const pngPath = path.join(tmpDir, "logo.png");

      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <rect width="100" height="100" fill="#2563eb"/>
        <circle cx="50" cy="50" r="30" fill="#ffffff"/>
      </svg>`;

      fs.writeFileSync(svgPath, svgContent, "utf-8");

      const res = await adapter.convert(svgPath, pngPath, "svg", "png");
      expect(res.outputBytes).toBeGreaterThan(0);
      expect(res.mimeType).toBe("image/png");

      const meta = await sharp(pngPath).metadata();
      expect(meta.format).toBe("png");
      expect(meta.width).toBe(100);
      expect(meta.height).toBe(100);
    });

    it("should convert PNG to valid multi-resolution Windows Favicon ICO (16, 32, 48, 256)", async () => {
      const inputPng = path.join(tmpDir, "favicon_source.png");
      const outputIco = path.join(tmpDir, "favicon.ico");

      await sharp({
        create: {
          width: 64,
          height: 64,
          channels: 4,
          background: { r: 255, g: 100, b: 0, alpha: 1 },
        },
      })
        .png()
        .toFile(inputPng);

      const res = await adapter.convert(inputPng, outputIco, "png", "ico");
      expect(res.outputBytes).toBeGreaterThan(0);
      expect(res.mimeType).toBe("image/x-icon");

      const icoBuf = fs.readFileSync(outputIco);
      // ICO Magic Bytes: 00 00 01 00
      expect(icoBuf[0]).toBe(0x00);
      expect(icoBuf[1]).toBe(0x00);
      expect(icoBuf[2]).toBe(0x01);
      expect(icoBuf[3]).toBe(0x00);
      // Image count: 4 (16, 32, 48, 256 high-DPI)
      expect(icoBuf.readUInt16LE(4)).toBe(4);
      expect(icoBuf[6]).toBe(16);
      expect(icoBuf[6 + 16]).toBe(32);
      expect(icoBuf[6 + 32]).toBe(48);
      expect(icoBuf[6 + 48]).toBe(0); // 0 encodes 256px per Microsoft ICO specification
    });
  });

  describe("XML, TSV & Markdown Conversion via PureDataAdapter", () => {
    const adapter = new PureDataAdapter();

    it("should convert JSON to XML and back", async () => {
      const jsonPath = path.join(tmpDir, "sample.json");
      const xmlPath = path.join(tmpDir, "sample.xml");

      const sampleObj = { title: "FileFlow", version: "2.0", active: true };
      fs.writeFileSync(jsonPath, JSON.stringify(sampleObj), "utf-8");

      const res = await adapter.convert(jsonPath, xmlPath, "json", "xml");
      expect(res.outputBytes).toBeGreaterThan(0);
      expect(res.mimeType).toBe("application/xml");

      const xmlText = fs.readFileSync(xmlPath, "utf-8");
      expect(xmlText).toContain("<title>FileFlow</title>");
      expect(xmlText).toContain("<version>2.0</version>");
    });

    it("should convert CSV to TSV", async () => {
      const csvPath = path.join(tmpDir, "data.csv");
      const tsvPath = path.join(tmpDir, "data.tsv");

      fs.writeFileSync(csvPath, "id,nama,poin\n1,Andi,95\n2,Budi,88", "utf-8");

      const res = await adapter.convert(csvPath, tsvPath, "csv", "tsv");
      expect(res.outputBytes).toBeGreaterThan(0);
      expect(res.mimeType).toBe("text/tab-separated-values");

      const tsvText = fs.readFileSync(tsvPath, "utf-8");
      expect(tsvText).toContain("id\tnama\tpoin");
      expect(tsvText).toContain("1\tAndi\t95");
    });

    it("should convert Markdown to HTML", async () => {
      const mdPath = path.join(tmpDir, "doc.md");
      const htmlPath = path.join(tmpDir, "doc.html");

      fs.writeFileSync(
        mdPath,
        "# Judul Dokumen\n\n**Teks tebal** dan *teks miring*.\n\n- Poin pertama\n- Poin kedua",
        "utf-8"
      );

      const res = await adapter.convert(mdPath, htmlPath, "md", "html");
      expect(res.outputBytes).toBeGreaterThan(0);
      expect(res.mimeType).toBe("text/html");

      const htmlContent = fs.readFileSync(htmlPath, "utf-8");
      expect(htmlContent).toContain("<h1>Judul Dokumen</h1>");
      expect(htmlContent).toContain("<strong>Teks tebal</strong>");
      expect(htmlContent).toContain("<li>Poin pertama</li>");
    });
  });

  describe("Multi-Pass Background Removal with Solid Replacement", () => {
    const provider = new SharpLocalBgRemovalProvider();

    it("should replace white background with solid red pas foto color", async () => {
      const inputImg = path.join(tmpDir, "portrait.png");
      const outputImg = path.join(tmpDir, "portrait_red.png");

      // Create synthetic image with white border and dark center
      const rawBuf = Buffer.alloc(40 * 40 * 4, 255); // all white
      // Fill center 20x20 with blue
      for (let y = 10; y < 30; y++) {
        for (let x = 10; x < 30; x++) {
          const idx = (y * 40 + x) * 4;
          rawBuf[idx] = 0; // R
          rawBuf[idx + 1] = 0; // G
          rawBuf[idx + 2] = 200; // B
          rawBuf[idx + 3] = 255; // A
        }
      }

      await sharp(rawBuf, { raw: { width: 40, height: 40, channels: 4 } })
        .png()
        .toFile(inputImg);

      const res = await provider.removeBackground(inputImg, outputImg, {
        mode: "solid",
        replacementColor: "#D32F2F", // Red
      });

      expect(res.outputBytes).toBeGreaterThan(0);
      expect(res.mode).toBe("solid");

      const resultRaw = await sharp(outputImg).raw().toBuffer();
      // Check top-left pixel (was white, should now be reddish D3 = 211, 2F = 47, 2F = 47)
      expect(resultRaw[0]).toBeGreaterThan(180); // Red channel high
      expect(resultRaw[1]).toBeLessThan(70); // Green channel low
      expect(resultRaw[2]).toBeLessThan(70); // Blue channel low
      expect(resultRaw[3]).toBe(255); // Fully opaque composite
    });
  });
});
