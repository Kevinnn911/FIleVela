// File: tests/integration/office-conversion.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import sharp from "sharp";
import { UniversalOfficeDocumentAdapter } from "@/lib/adapters/office-document";
import { capabilityRegistry } from "@/lib/adapters/registry";
import { ZipWriter } from "@/lib/document/zip-writer";

describe("Universal Office & Hybrid Conversion Integration Tests", () => {
  const tmpDir = path.join(os.tmpdir(), `fileflow_office_test_${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const adapter = new UniversalOfficeDocumentAdapter();

  it("should be available in node environment", async () => {
    const isAvail = await adapter.isAvailable();
    expect(isAvail).toBe(true);
  });

  it("should return valid target formats for pptx, docx, and xlsx", async () => {
    const pptTargets = await adapter.getSupportedTargets("pptx");
    const pptFormats = pptTargets.map((t) => t.targetFormat);
    expect(pptFormats).toContain("pdf");
    expect(pptFormats).toContain("txt");
    expect(pptFormats).toContain("md");

    const docxTargets = await adapter.getSupportedTargets("docx");
    const docxFormats = docxTargets.map((t) => t.targetFormat);
    expect(docxFormats).toContain("pdf");
    expect(docxFormats).toContain("html");

    const xlsxTargets = await adapter.getSupportedTargets("xlsx");
    const xlsxFormats = xlsxTargets.map((t) => t.targetFormat);
    expect(xlsxFormats).toContain("pdf");
    expect(xlsxFormats).toContain("csv");
    expect(xlsxFormats).toContain("json");
  });

  it("should convert PPTX presentation to PDF", async () => {
    const inputPath = path.join(tmpDir, "presentation.pptx");
    const outputPath = path.join(tmpDir, "presentation.pdf");

    // Build mock PPTX package
    const writer = new ZipWriter();
    writer.addFile(
      "ppt/slides/slide1.xml",
      '<?xml version="1.0"?><p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Pengenalan FileFlow</a:t></a:r></a:p><a:p><a:r><a:t>Solusi konversi media dan kompresi universal.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
    );
    writer.addFile(
      "ppt/slides/slide2.xml",
      '<?xml version="1.0"?><p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Fitur Utama</a:t></a:r></a:p><a:p><a:r><a:t>1. Zero Fake Conversions</a:t></a:r></a:p><a:p><a:r><a:t>2. Penyimpanan Efemeral 60 Menit</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
    );

    fs.writeFileSync(inputPath, writer.toBuffer());

    const result = await adapter.convert(inputPath, outputPath, "pptx", "pdf");

    expect(result.outputBytes).toBeGreaterThan(0);
    expect(result.mimeType).toBe("application/pdf");
    expect(fs.existsSync(outputPath)).toBe(true);

    const pdfContent = fs.readFileSync(outputPath, "binary");
    expect(pdfContent.startsWith("%PDF-1.4")).toBe(true);
    expect(pdfContent.includes("Pengenalan FileFlow")).toBe(true);
    expect(pdfContent.includes("Fitur Utama")).toBe(true);
  });

  it("should convert high-fidelity PPTX with background image to widescreen PDF", async () => {
    const inputPath = path.join(tmpDir, "high_fidelity_presentation.pptx");
    const outputPath = path.join(tmpDir, "high_fidelity_presentation.pdf");

    const sampleBgJpeg = await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 3,
        background: { r: 20, g: 30, b: 60 },
      },
    })
      .jpeg()
      .toBuffer();

    const writer = new ZipWriter();
    writer.addFile(
      "ppt/presentation.xml",
      '<?xml version="1.0"?><p:presentation><p:sldSz cx="18288000" cy="10287000"/></p:presentation>'
    );
    writer.addFile(
      "ppt/slides/slide1.xml",
      '<?xml version="1.0"?><p:sld><p:cSld><p:spTree><p:sp><p:spPr><a:blipFill><a:blip r:embed="rId1"/></a:blipFill></p:spPr><p:txBody><a:p><a:pPr algn="ctr"/><a:r><a:rPr b="1" sz="4800"/><a:t>High Fidelity Slide</a:t></a:r></a:p><a:p><a:pPr algn="ctr"/><a:r><a:rPr b="1" sz="3600"/><a:t>Centered Presentation Typography</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
    );
    writer.addFile(
      "ppt/slides/_rels/slide1.xml.rels",
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.jpeg"/></Relationships>'
    );
    writer.addFile("ppt/media/image1.jpeg", sampleBgJpeg);

    fs.writeFileSync(inputPath, writer.toBuffer());

    const result = await adapter.convert(inputPath, outputPath, "pptx", "pdf");

    expect(result.outputBytes).toBeGreaterThan(0);
    expect(result.mimeType).toBe("application/pdf");
    expect(fs.existsSync(outputPath)).toBe(true);

    const pdfContent = fs.readFileSync(outputPath, "binary");
    expect(pdfContent.startsWith("%PDF-1.4")).toBe(true);
    expect(pdfContent.includes("/Subtype /Image")).toBe(true);
    expect(pdfContent.includes("/Filter /DCTDecode")).toBe(true);
    expect(pdfContent.includes("High Fidelity Slide")).toBe(true);
    expect(pdfContent.includes("Centered Presentation Typography")).toBe(true);
  });

  it("should convert real-world user worship song PPTX to high-fidelity PDF if present", async () => {
    const userPptx =
      ".storage/jobs/172dd631-f0de-47d5-826a-6d74749e3a1d/input/3_Yesus_Kau_Sungguh_Baik_Bridge_2_.pptx";
    const userPdf =
      ".storage/jobs/172dd631-f0de-47d5-826a-6d74749e3a1d/output/3_Yesus_Kau_Sungguh_Baik_Bridge_2_.pdf";

    if (!fs.existsSync(userPptx)) {
      return;
    }

    const result = await adapter.convert(userPptx, userPdf, "pptx", "pdf");

    expect(result.outputBytes).toBeGreaterThan(300000); // Embedded image gives ~360 KB, not wireframe 21 KB
    expect(result.mimeType).toBe("application/pdf");
    expect(fs.existsSync(userPdf)).toBe(true);

    const pdfContent = fs.readFileSync(userPdf, "binary");
    expect(pdfContent.startsWith("%PDF-1.4")).toBe(true);
    expect(pdfContent.includes("/Subtype /Image")).toBe(true);
    expect(pdfContent.includes("/Filter /DCTDecode")).toBe(true);
    expect(pdfContent.includes("/Im1")).toBe(true);
    expect(pdfContent.includes("/Count 14")).toBe(true); // 14 slides
    expect(pdfContent.includes("Yesus, Kau sungguh baik")).toBe(true);
  });

  it("should convert DOCX document to PDF", async () => {
    const inputPath = path.join(tmpDir, "document.docx");
    const outputPath = path.join(tmpDir, "document.pdf");

    const writer = new ZipWriter();
    writer.addFile(
      "word/document.xml",
      '<?xml version="1.0"?><w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Laporan Eksekutif FileFlow</w:t></w:r></w:p><w:p><w:r><w:t>Sistem beroperasi dengan standar keamanan tinggi dan zero dependency leaks.</w:t></w:r></w:p></w:body></w:document>'
    );

    fs.writeFileSync(inputPath, writer.toBuffer());

    const result = await adapter.convert(inputPath, outputPath, "docx", "pdf");

    expect(result.outputBytes).toBeGreaterThan(0);
    expect(result.mimeType).toBe("application/pdf");
    expect(fs.existsSync(outputPath)).toBe(true);

    const pdfContent = fs.readFileSync(outputPath, "binary");
    expect(pdfContent.startsWith("%PDF-1.4")).toBe(true);
    expect(pdfContent.includes("Laporan Eksekutif FileFlow")).toBe(true);
  });

  it("should convert XLSX spreadsheet to PDF, CSV, and JSON", async () => {
    const inputPath = path.join(tmpDir, "data.xlsx");
    const pdfPath = path.join(tmpDir, "data.pdf");
    const csvPath = path.join(tmpDir, "data.csv");
    const jsonPath = path.join(tmpDir, "data.json");

    const writer = new ZipWriter();
    writer.addFile(
      "xl/sharedStrings.xml",
      '<?xml version="1.0"?><sst><si><t>Nama</t></si><si><t>Divisi</t></si><si><t>Gaji</t></si><si><t>Budi Santoso</t></si><si><t>Teknologi</t></si><si><t>15000000</t></si></sst>'
    );
    writer.addFile(
      "xl/worksheets/sheet1.xml",
      '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c></row></sheetData></worksheet>'
    );

    fs.writeFileSync(inputPath, writer.toBuffer());

    // 1. Convert to PDF
    const pdfRes = await adapter.convert(inputPath, pdfPath, "xlsx", "pdf");
    expect(pdfRes.outputBytes).toBeGreaterThan(0);
    expect(pdfRes.mimeType).toBe("application/pdf");

    // 2. Convert to CSV
    const csvRes = await adapter.convert(inputPath, csvPath, "xlsx", "csv");
    expect(csvRes.outputBytes).toBeGreaterThan(0);
    const csvContent = fs.readFileSync(csvPath, "utf8");
    expect(csvContent).toContain("Nama,Divisi,Gaji");
    expect(csvContent).toContain("Budi Santoso,Teknologi,15000000");

    // 3. Convert to JSON
    const jsonRes = await adapter.convert(inputPath, jsonPath, "xlsx", "json");
    expect(jsonRes.outputBytes).toBeGreaterThan(0);
    const jsonContent = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(jsonContent).toEqual([
      { Nama: "Budi Santoso", Divisi: "Teknologi", Gaji: "15000000" },
    ]);
  });

  it("should resolve adapter through CapabilityRegistry for hybrid conversions", async () => {
    const pairAdapter = await capabilityRegistry.findAdapterForPair("pptx", "pdf");
    expect(pairAdapter).not.toBeNull();
    expect(pairAdapter?.id).toBe("universal-office-document");
  });
});
