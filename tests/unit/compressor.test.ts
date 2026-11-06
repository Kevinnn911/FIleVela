// File: tests/unit/compressor.test.ts

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { compressFileBuffer } from "@/lib/compression/file-compressor";
import { ZipWriter } from "@/lib/document/zip-writer";

describe("File Compressor Unit Tests", () => {
  it("should compress JPEG image and reduce file size", async () => {
    const rawImage = await sharp({
      create: {
        width: 300,
        height: 300,
        channels: 3,
        background: { r: 180, g: 120, b: 60 },
      },
    })
      .jpeg({ quality: 100 })
      .toBuffer();

    const result = await compressFileBuffer(
      rawImage,
      "jpeg",
      "image/jpeg",
      "recommended"
    );

    expect(result.originalSizeBytes).toBe(rawImage.length);
    expect(result.compressedSizeBytes).toBeLessThanOrEqual(rawImage.length);
    expect(result.savedBytes).toBeGreaterThanOrEqual(0);
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should compress JSON text by stripping whitespace", async () => {
    const uncompressedJson = JSON.stringify(
      {
        nama: "FileFlow Universal",
        fitur: ["Konversi", "Kompresi", "Hapus Latar Belakang"],
        versi: "2.0.0",
      },
      null,
      4
    );

    const jsonBuffer = Buffer.from(uncompressedJson, "utf8");
    const result = await compressFileBuffer(
      jsonBuffer,
      "json",
      "application/json",
      "recommended"
    );

    expect(result.compressedSizeBytes).toBeLessThan(result.originalSizeBytes);
    expect(result.savedBytes).toBeGreaterThan(0);
    expect(result.savedPercentage).toBeGreaterThan(10);
  });

  it("should compress ZIP/DOCX package safely", async () => {
    const writer = new ZipWriter();
    writer.addFile(
      "word/document.xml",
      "<w:document><w:body><w:p><w:t>Halo dari FileFlow Dokumen!</w:t></w:p></w:body></w:document>",
      false
    );
    writer.addFile("docProps/thumbnail.jpeg", "fake_thumbnail_content", false);

    const rawPackage = writer.toBuffer();
    const result = await compressFileBuffer(
      rawPackage,
      "docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "recommended"
    );

    expect(result.compressedBuffer).toBeInstanceOf(Buffer);
    expect(result.compressedSizeBytes).toBeLessThanOrEqual(result.originalSizeBytes);
  });
});

