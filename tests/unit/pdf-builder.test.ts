// File: tests/unit/pdf-builder.test.ts

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { SimplePdfDocument, getJpegDimensions } from "@/lib/document/pdf-builder";

describe("SimplePdfDocument Unit Tests", () => {
  it("should create a valid PDF 1.4 buffer with single page", () => {
    const doc = new SimplePdfDocument("Test Document", "FileFlow Test");
    doc.addPage("portrait");
    doc.drawText("Halo Dunia", 50, 750, { fontSize: 14, font: "bold" });
    doc.drawParagraph(
      "Ini adalah paragraf pengujian dengan wrapping otomatis yang panjang.",
      50,
      720,
      400
    );
    doc.drawRect(50, 600, 200, 50, {
      fillColor: [0.95, 0.95, 0.95],
      strokeColor: [0.2, 0.2, 0.2],
      lineWidth: 1,
    });
    doc.drawLine(50, 580, 250, 580);
    doc.drawHeaderFooter(1, 1);

    const pdfBuffer = doc.toBuffer();
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(300);

    const pdfString = pdfBuffer.toString("binary");
    expect(pdfString.startsWith("%PDF-1.4")).toBe(true);
    expect(pdfString.includes("Halo Dunia")).toBe(true);
    expect(pdfString.includes("/Type /Catalog")).toBe(true);
    expect(pdfString.includes("/Type /Pages")).toBe(true);
    expect(pdfString.includes("xref")).toBe(true);
    expect(pdfString.includes("trailer")).toBe(true);
    expect(pdfString.trim().endsWith("%%EOF")).toBe(true);
  });

  it("should support landscape multi-page document generation", () => {
    const doc = new SimplePdfDocument("Presentation Test", "Author");
    doc.addPage("landscape");
    doc.drawText("Slide 1", 50, 500, { fontSize: 20 });

    doc.addPage("landscape");
    doc.drawText("Slide 2", 50, 500, { fontSize: 20 });

    const pdfBuffer = doc.toBuffer();
    const pdfString = pdfBuffer.toString("binary");

    expect(pdfString.includes("/Count 2")).toBe(true);
    expect(pdfString.includes("Slide 1")).toBe(true);
    expect(pdfString.includes("Slide 2")).toBe(true);
  });

  it("should embed JPEG image XObject with correct dimensions", async () => {
    const testJpeg = await sharp({
      create: {
        width: 120,
        height: 80,
        channels: 3,
        background: { r: 255, g: 100, b: 50 },
      },
    })
      .jpeg()
      .toBuffer();

    const dims = getJpegDimensions(testJpeg);
    expect(dims).not.toBeNull();
    expect(dims?.width).toBe(120);
    expect(dims?.height).toBe(80);

    const doc = new SimplePdfDocument("Image Test", "FileFlow Engine");
    doc.addPage("landscape", 960, 540);
    doc.drawImage(testJpeg, 0, 0, 960, 540);
    doc.drawText("Widescreen Slide", 480, 270, { align: "center", font: "bold" });

    const pdfBuffer = doc.toBuffer();
    const pdfString = pdfBuffer.toString("binary");

    expect(pdfString.includes("/Subtype /Image")).toBe(true);
    expect(pdfString.includes("/Filter /DCTDecode")).toBe(true);
    expect(pdfString.includes("/Width 120")).toBe(true);
    expect(pdfString.includes("/Height 80")).toBe(true);
    expect(pdfString.includes("/XObject <<")).toBe(true);
    expect(pdfString.includes("/Im1")).toBe(true);
  });
});
