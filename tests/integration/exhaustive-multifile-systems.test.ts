// File: tests/integration/exhaustive-multifile-systems.test.ts

import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib';

import { POST as createJobHandler } from '@/app/api/jobs/route';
import {
  DELETE as deleteJobHandler,
  GET as getJobHandler,
} from '@/app/api/jobs/[id]/route';
import { GET as downloadJobHandler } from '@/app/api/jobs/[id]/download/route';
import { POST as batchZipHandler } from '@/app/api/jobs/batch-zip/route';
import { POST as compressHandler } from '@/app/api/compress/route';
import { POST as bgRemovalHandler } from '@/app/api/background-removal/route';
import { POST as pdfMergeHandler } from '@/app/api/pdf/merge/route';
import { POST as pdfSplitHandler } from '@/app/api/pdf/split/route';
import { POST as downloaderExtractHandler } from '@/app/api/downloader/extract/route';
import { GET as downloaderStreamHandler } from '@/app/api/downloader/download/route';

import { decodeBmpToRgba, encodeRgbaToBmp } from '@/lib/image/bmp-ico-codec';
import { ZipReader } from '@/lib/document/zip-reader';
import { ZipWriter } from '@/lib/document/zip-writer';
import {
  type DocumentSection,
  parseDocx,
  parseXlsx,
} from '@/lib/document/office-parser';
import { buildClientZipBlob } from '@/lib/client/client-zip';
import { buildContentDispositionHeader } from '@/lib/storage/path-sanitizer';
import {
  getJobDir,
  getStorageBaseDir,
  readJobMeta,
  sweepExpiredStorage,
  writeJobMeta,
} from '@/lib/storage/temp-storage';

const execFileAsync = promisify(execFile);

interface CreatedJobRecord {
  jobId: string;
  ownerToken: string;
}

const createdJobs: CreatedJobRecord[] = [];
let tempMediaDir = '';
let hasFfmpeg = false;

function trackJob(jobId?: string, ownerToken?: string): void {
  if (jobId && ownerToken) {
    createdJobs.push({ jobId, ownerToken });
  }
}

function joinDocSections(sections: DocumentSection[]): string {
  return sections.map((s) => s.text).join('\n');
}

async function postConvertJob(
  buf: Buffer,
  filename: string,
  targetFormat: string,
  mime = 'application/octet-stream'
): Promise<{ status: number; body: Record<string, unknown>; outBuf?: Buffer }> {
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(buf)], { type: mime }), filename);
  formData.append('targetFormat', targetFormat);

  const req = new NextRequest('http://localhost:3000/api/jobs', {
    method: 'POST',
    body: formData,
  });

  const res = await createJobHandler(req);
  const body = (await res.json()) as Record<string, unknown>;
  if (res.status === 201 && body.job && typeof body.ownerToken === 'string') {
    const jobObj = body.job as { id: string };
    trackJob(jobObj.id, body.ownerToken);
    const dlReq = new NextRequest(
      `http://localhost:3000/api/jobs/${jobObj.id}/download?token=${body.ownerToken}`
    );
    const dlRes = await downloadJobHandler(dlReq, { params: { id: jobObj.id } });
    expect(dlRes.status).toBe(200);
    const outBuf = Buffer.from(await dlRes.arrayBuffer());
    return { status: res.status, body, outBuf };
  }
  return { status: res.status, body };
}

async function postCompressJob(
  buf: Buffer,
  filename: string,
  level: 'low' | 'recommended' | 'extreme',
  mime = 'application/octet-stream'
): Promise<{ status: number; body: Record<string, unknown>; outBuf?: Buffer }> {
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(buf)], { type: mime }), filename);
  formData.append('level', level);

  const req = new NextRequest('http://localhost:3000/api/compress', {
    method: 'POST',
    body: formData,
  });

  const res = await compressHandler(req);
  const body = (await res.json()) as Record<string, unknown>;
  if (res.status === 200 && body.job && typeof body.ownerToken === 'string') {
    const jobObj = body.job as { id: string };
    trackJob(jobObj.id, body.ownerToken);
    const dlReq = new NextRequest(
      `http://localhost:3000/api/jobs/${jobObj.id}/download?token=${body.ownerToken}`
    );
    const dlRes = await downloadJobHandler(dlReq, { params: { id: jobObj.id } });
    expect(dlRes.status).toBe(200);
    const outBuf = Buffer.from(await dlRes.arrayBuffer());
    return { status: res.status, body, outBuf };
  }
  return { status: res.status, body };
}

async function createNoisyPhotoJpeg(
  width: number,
  height: number,
  quality = 98
): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  let seed = 0x12345678;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = (seed >>> 24) & 0x3f;
      const idx = (y * width + x) * 3;
      raw[idx] = Math.min(255, ((x * 255) / width + noise) | 0);
      raw[idx + 1] = Math.min(255, ((y * 255) / height + (noise >> 1)) | 0);
      raw[idx + 2] = Math.min(255, (120 + noise) | 0);
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

async function createAlphaPng(width = 96, height = 96): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const inside = x >= 24 && x < width - 24 && y >= 24 && y < height - 24;
      if (inside) {
        raw[idx] = 30;
        raw[idx + 1] = 110;
        raw[idx + 2] = 240;
        raw[idx + 3] = 255;
      } else {
        raw[idx] = 0;
        raw[idx + 1] = 0;
        raw[idx + 2] = 0;
        raw[idx + 3] = 0;
      }
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

function createPure3FrameGif89a(): Buffer {
  // Deterministic 1x1 3-frame animated GIF89a with Global Color Table (Red, Green, Blue, Black)
  return Buffer.from([
    // Header "GIF89a"
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
    // Logical Screen Descriptor: width=1, height=1, GCT=1 (4 colors -> 0x91), bg=0, aspect=0
    0x01, 0x00, 0x01, 0x00, 0x91, 0x00, 0x00,
    // Global Color Table (4 x RGB = 12 bytes)
    0xff, 0x20, 0x20,
    0x20, 0xd8, 0x50,
    0x20, 0x60, 0xff,
    0x00, 0x00, 0x00,
    // Netscape 2.0 Infinite Loop Application Extension
    0x21, 0xff, 0x0b,
    0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
    0x03, 0x01, 0x00, 0x00, 0x00,
    // Frame 1 (color index 0): GCE + Image Descriptor + LZW minCodeSize=2, sub-block [0x44, 0x01]
    0x21, 0xf9, 0x04, 0x04, 0x08, 0x00, 0x00, 0x00,
    0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0x02, 0x02, 0x44, 0x01, 0x00,
    // Frame 2 (color index 1): LZW codes Clear(4), 1, EOI(5) -> 100, 001, 101 -> 0x4c, 0x01
    0x21, 0xf9, 0x04, 0x04, 0x08, 0x00, 0x00, 0x00,
    0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0x02, 0x02, 0x4c, 0x01, 0x00,
    // Frame 3 (color index 2): LZW codes Clear(4), 2, EOI(5) -> 100, 010, 101 -> 0x54, 0x01
    0x21, 0xf9, 0x04, 0x04, 0x08, 0x00, 0x00, 0x00,
    0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0x02, 0x02, 0x54, 0x01, 0x00,
    // Trailer
    0x3b,
  ]);
}

async function createAnimatedGif3Frames(): Promise<Buffer> {
  if (hasFfmpeg) {
    return generateFfmpegSample('anim_3frames.gif', [
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=48x48:rate=3',
      '-frames:v',
      '3',
      '-loop',
      '0',
    ]);
  }
  return createPure3FrameGif89a();
}

async function createWhiteShirtPortraitPng(): Promise<Buffer> {
  const w = 160;
  const h = 160;
  const raw = Buffer.alloc(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      // Studio off-white wall (#f8fafc)
      let r = 248;
      let g = 250;
      let b = 252;

      // Head circle centered at (80, 52), radius 24 with dark hair/outline ring
      const dxHead = x - 80;
      const dyHead = y - 52;
      const distHeadSq = dxHead * dxHead + dyHead * dyHead;

      // Torso jacket rectangle x in [34..126], y in [78..159]
      const inJacket = x >= 34 && x <= 126 && y >= 78;
      // Bright white dress shirt V-zone completely enclosed by dark navy jacket & collar
      const inShirt = x >= 60 && x <= 100 && y >= 92 && y <= 148;

      if (distHeadSq <= 24 * 24) {
        if (distHeadSq >= 19 * 19) {
          // Dark hair / head border (#1e293b)
          r = 24;
          g = 32;
          b = 48;
        } else {
          // Warm skin tone
          r = 218;
          g = 172;
          b = 142;
        }
      } else if (inShirt) {
        // Pure white shirt (#ffffff) surrounded on left/right/top/bottom by dark navy jacket
        r = 255;
        g = 255;
        b = 255;
      } else if (inJacket) {
        // Dark navy suit blazer (#172033)
        r = 23;
        g = 32;
        b = 51;
      }

      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = 255;
    }
  }

  return sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function createCutoutDarkHairPng(): Promise<Buffer> {
  const w = 120;
  const h = 120;
  const raw = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const dx = x - 60;
      const dy = y - 60;
      if (dx * dx + dy * dy <= 34 * 34) {
        // Dark hair/silhouette (#121216) fully opaque
        raw[idx] = 18;
        raw[idx + 1] = 18;
        raw[idx + 2] = 22;
        raw[idx + 3] = 255;
      } else {
        // Already transparent background
        raw[idx] = 0;
        raw[idx + 1] = 0;
        raw[idx + 2] = 0;
        raw[idx + 3] = 0;
      }
    }
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function createRichDocxBuffer(includeHeavyMedia = false): Promise<Buffer> {
  const zip = new ZipWriter();
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const longUrl =
    'https://enterprise.fileflow.example/api/v2/verification/audit/' +
    'a'.repeat(115);

  const paragraphs: string[] = [
    `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Laporan Audit Sistem &apos;FileFlow&apos; &amp; &quot;Nusa&quot;</w:t></w:r></w:p>`,
    `<w:p><w:r><w:t>Ringkasan eksekutif -- pengujian integritas multi-format berjalan optimal.</w:t></w:r></w:p>`,
    `<w:p><w:r><w:t>Tautan referensi panjang: ${longUrl}</w:t></w:r></w:p>`,
  ];
  for (let i = 1; i <= 18; i++) {
    paragraphs.push(
      `<w:p><w:r><w:t>Paragraf nomor ${i}: Dokumen ini memverifikasi pembungkus baris panjang, entitas XML, dan penomoran multi-halaman secara akurat.</w:t></w:r></w:p>`
    );
  }

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.join('\n    ')}
  </w:body>
</w:document>`;

  zip.addFile('[Content_Types].xml', Buffer.from(contentTypes, 'utf-8'));
  zip.addFile('_rels/.rels', Buffer.from(rels, 'utf-8'));
  zip.addFile('word/document.xml', Buffer.from(docXml, 'utf-8'));

  if (includeHeavyMedia) {
    const heavyJpg = await createNoisyPhotoJpeg(640, 480, 97);
    zip.addFile('word/media/image1.jpg', heavyJpg, false);
  }

  return zip.toBuffer();
}

async function createRichPptxWithPngAndJpg(): Promise<Buffer> {
  const zip = new ZipWriter();
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`;

  const presentationXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`;

  const slide1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Slide Satu: Diagram PNG</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;

  const slide2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Slide Dua: Foto JPEG</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;

  const slidePng = await createAlphaPng(180, 120);
  const slideJpg = await createNoisyPhotoJpeg(240, 160, 92);

  zip.addFile('[Content_Types].xml', Buffer.from(contentTypes, 'utf-8'));
  zip.addFile('ppt/presentation.xml', Buffer.from(presentationXml, 'utf-8'));
  zip.addFile('ppt/slides/slide1.xml', Buffer.from(slide1Xml, 'utf-8'));
  zip.addFile('ppt/slides/slide2.xml', Buffer.from(slide2Xml, 'utf-8'));
  zip.addFile('ppt/media/image1.png', slidePng, false);
  zip.addFile('ppt/media/image2.jpg', slideJpg, false);

  return zip.toBuffer();
}

async function createWideSparseXlsxBuffer(includeHeavyMedia = false): Promise<Buffer> {
  const zip = new ZipWriter();
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheets><sheet name="Rekapitulasi15Kolom" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets>
</workbook>`;

  const colLetters = [
    'A',
    'B',
    'C',
    'D',
    'E',
    'F',
    'G',
    'H',
    'I',
    'J',
    'K',
    'L',
    'M',
    'N',
    'O',
  ];
  const headerCells = colLetters
    .map(
      (col, idx) =>
        `<c r="${col}1" t="inlineStr"><is><t>Kolom_${idx + 1}</t></is></c>`
    )
    .join('');

  // Row 2 intentionally skips B2, C2, D2 and jumps straight from A2 to E2 and O2
  const sparseRow2 = `<row r="2">
    <c r="A2" t="inlineStr"><is><t> Kode_Awal </t></is></c>
    <c r="E2" t="inlineStr"><is><t>Nilai_Kolom_5</t></is></c>
    <c r="J2" t="b"><v>1</v></c>
    <c r="O2"><v>98765.43</v></c>
  </row>`;

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">${headerCells}</row>
    ${sparseRow2}
  </sheetData>
</worksheet>`;

  zip.addFile('[Content_Types].xml', Buffer.from(contentTypes, 'utf-8'));
  zip.addFile('xl/workbook.xml', Buffer.from(workbookXml, 'utf-8'));
  zip.addFile('xl/worksheets/sheet1.xml', Buffer.from(sheetXml, 'utf-8'));

  if (includeHeavyMedia) {
    const heavyJpg = await createNoisyPhotoJpeg(600, 400, 97);
    zip.addFile('xl/media/image1.jpg', heavyJpg, false);
  }

  return zip.toBuffer();
}

function createRichOdtBuffer(): Buffer {
  const zip = new ZipWriter();
  zip.addFile(
    'mimetype',
    Buffer.from('application/vnd.oasis.opendocument.text', 'utf-8'),
    false
  );
  const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0">
  <office:body>
    <office:text>
      <text:h text:outline-level="1">Dokumen Standar OpenDocument</text:h>
      <text:p>Paragraf pembuka ODT untuk pengujian sistem konversi FileFlow.</text:p>
      <table:table>
        <table:table-row>
          <table:table-cell><text:p>Komponen</text:p></table:table-cell>
          <table:table-cell><text:p>Status</text:p></table:table-cell>
        </table:table-row>
        <table:table-row>
          <table:table-cell><text:p>Parser ODT</text:p></table:table-cell>
          <table:table-cell><text:p>Optimal</text:p></table:table-cell>
        </table:table-row>
      </table:table>
    </office:text>
  </office:body>
</office:document-content>`;
  zip.addFile('content.xml', Buffer.from(contentXml, 'utf-8'));
  return zip.toBuffer();
}

function createRichRtfBuffer(): Buffer {
  const rtf =
    '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\b Dokumen Resmi RTF FileFlow\\b0\\par Baris pertama isi dokumen dengan karakter Unicode \\u233? dan angka 2026.\\par Baris kedua selesai.\\par}';
  return Buffer.from(rtf, 'ascii');
}

async function createFlateCompressedPdfBuffer(
  lines: string[],
  pageCount = 1
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let p = 0; p < pageCount; p++) {
    const page = pdfDoc.addPage([595, 842]);
    let y = 780;
    page.drawText(`Halaman Uji ${p + 1}`, {
      x: 50,
      y,
      size: 16,
      font,
      color: rgb(0.1, 0.1, 0.2),
    });
    y -= 28;
    for (const line of lines) {
      page.drawText(line, { x: 50, y, size: 11, font });
      y -= 18;
    }
  }

  const saved = await pdfDoc.save({ useObjectStreams: false });
  return Buffer.from(saved);
}

async function createImageHeavyPdfBuffer(): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const bigJpg = await createNoisyPhotoJpeg(900, 700, 98);
  const embedded = await pdfDoc.embedJpg(bigJpg);

  for (let i = 0; i < 2; i++) {
    const page = pdfDoc.addPage([600, 500]);
    page.drawImage(embedded, { x: 25, y: 25, width: 550, height: 450 });
  }

  const saved = await pdfDoc.save({ useObjectStreams: false });
  return Buffer.from(saved);
}

async function generateFfmpegSample(
  filename: string,
  args: string[]
): Promise<Buffer> {
  const outPath = path.join(tempMediaDir, filename);
  await execFileAsync('ffmpeg', ['-y', ...args, outPath], { timeout: 25000 });
  return fs.promises.readFile(outPath);
}

describe('Exhaustive 80+ Multi-File & Multi-Format Verification Across All 5 Systems', () => {
  beforeAll(async () => {
    sharp.cache(false);
    await sweepExpiredStorage({
      force: true,
      maxAgeMs: 60 * 60 * 1000,
      nowMs: Date.now(),
    });
    tempMediaDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'fileflow-stress-')
    );
    try {
      await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
      hasFfmpeg = true;
    } catch {
      hasFfmpeg = false;
    }
  }, 30000);

  afterAll(async () => {
    for (const rec of createdJobs) {
      const delReq = new NextRequest(
        `http://localhost:3000/api/jobs/${rec.jobId}`,
        {
          method: 'DELETE',
          headers: { 'X-Session-Token': rec.ownerToken },
        }
      );
      await deleteJobHandler(delReq, { params: { id: rec.jobId } }).catch(
        () => null
      );
    }
    if (tempMediaDir) {
      await fs.promises
        .rm(tempMediaDir, { recursive: true, force: true })
        .catch(() => null);
    }
  }, 30000);

  // =========================================================================
  // SYSTEM 1: KONVERSI (Images, Documents, Data, Media + 35-File Batch ZIP)
  // =========================================================================
  describe('System 1: Konversi Lintas Format (45+ Variasi Berkas + Batch 35 Berkas)', () => {
    it('flattens transparent PNG onto crisp white (#ffffff) when converting to JPG and preserves EXIF rotation on JPG -> WebP/ICO', async () => {
      const alphaPng = await createAlphaPng(80, 80);
      const jpgRes = await postConvertJob(alphaPng, 'transparan.png', 'jpg', 'image/png');
      expect(jpgRes.status).toBe(201);
      expect(jpgRes.outBuf).toBeDefined();

      const rawJpg = await sharp(jpgRes.outBuf!)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      // Corner pixel (0, 0) was alpha=0 in PNG -> must be white (>245), NOT black (0)
      expect(rawJpg.data[0]).toBeGreaterThan(245);
      expect(rawJpg.data[1]).toBeGreaterThan(245);
      expect(rawJpg.data[2]).toBeGreaterThan(245);

      // EXIF Orientation 6 (90 deg CW): stored as 120x60 -> rendered upright must become 60x120
      const exifJpg = await sharp({
        create: {
          width: 120,
          height: 60,
          channels: 3,
          background: { r: 30, g: 140, b: 220 },
        },
      })
        .withMetadata({ orientation: 6 })
        .jpeg({ quality: 90 })
        .toBuffer();

      const webpRes = await postConvertJob(exifJpg, 'kamera_potret.jpg', 'webp', 'image/jpeg');
      expect(webpRes.status).toBe(201);
      const webpMeta = await sharp(webpRes.outBuf!).metadata();
      expect(webpMeta.width).toBe(60);
      expect(webpMeta.height).toBe(120);

      // EXIF JPG -> multi-frame ICO (16, 32, 48, 256) + multi-frame ICO -> PNG (picks 256x256 frame)
      const icoRes = await postConvertJob(exifJpg, 'kamera_potret.jpg', 'ico', 'image/jpeg');
      expect(icoRes.status).toBe(201);
      expect(icoRes.outBuf![0]).toBe(0x00);
      expect(icoRes.outBuf![1]).toBe(0x00);
      expect(icoRes.outBuf![2]).toBe(0x01);
      expect(icoRes.outBuf![3]).toBe(0x00);
      expect(icoRes.outBuf!.readUInt16LE(4)).toBe(4);

      const icoBackToPng = await postConvertJob(
        icoRes.outBuf!,
        'app_icon.ico',
        'png',
        'image/x-icon'
      );
      expect(icoBackToPng.status).toBe(201);
      const extractedIcoMeta = await sharp(icoBackToPng.outBuf!).metadata();
      expect(extractedIcoMeta.width).toBe(256);
      expect(extractedIcoMeta.height).toBe(256);
    }, 30000);

    it('converts BMP <-> PNG/JPG/WebP, preserves multi-frame animation GIF <-> WebP, and exports PNG/SVG -> PDF', async () => {
      // 24-bit & 32-bit BMP round-trips
      const rgbaPixels = Buffer.alloc(40 * 30 * 4);
      for (let i = 0; i < rgbaPixels.length; i += 4) {
        rgbaPixels[i] = 25;
        rgbaPixels[i + 1] = 184;
        rgbaPixels[i + 2] = 255;
        rgbaPixels[i + 3] = 255;
      }
      const bmp24 = encodeRgbaToBmp(rgbaPixels, 40, 30, false);
      const bmp32 = encodeRgbaToBmp(rgbaPixels, 40, 30, true);

      const bmpToPng = await postConvertJob(bmp24, 'diagram24.bmp', 'png', 'image/bmp');
      expect(bmpToPng.status).toBe(201);
      const pngMeta = await sharp(bmpToPng.outBuf!).metadata();
      expect(pngMeta.width).toBe(40);
      expect(pngMeta.height).toBe(30);

      const bmp32ToWebp = await postConvertJob(bmp32, 'diagram32.bmp', 'webp', 'image/bmp');
      expect(bmp32ToWebp.status).toBe(201);

      const pngToBmp = await postConvertJob(
        bmpToPng.outBuf!,
        'diagram24.png',
        'bmp',
        'image/png'
      );
      expect(pngToBmp.status).toBe(201);
      const decodedBmp = decodeBmpToRgba(pngToBmp.outBuf!);
      expect(decodedBmp.width).toBe(40);
      expect(decodedBmp.height).toBe(30);

      // Animated 3-frame GIF <-> animated WebP round-trip
      const animGif = await createAnimatedGif3Frames();
      const srcGifMeta = await sharp(animGif, { animated: true }).metadata();
      expect(srcGifMeta.pages).toBe(3);

      const gifToWebpRes = await postConvertJob(animGif, 'animasi.gif', 'webp', 'image/gif');
      expect(gifToWebpRes.status).toBe(201);
      const animWebpMeta = await sharp(gifToWebpRes.outBuf!, { animated: true }).metadata();
      expect(animWebpMeta.pages).toBe(3);

      const webpToGifRes = await postConvertJob(
        gifToWebpRes.outBuf!,
        'animasi.webp',
        'gif',
        'image/webp'
      );
      expect(webpToGifRes.status).toBe(201);
      const roundtripGifMeta = await sharp(webpToGifRes.outBuf!, { animated: true }).metadata();
      expect(roundtripGifMeta.pages).toBe(3);

      // SVG -> PNG & PNG/SVG -> PDF
      const svgBuf = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="#2d5bff"/><circle cx="100" cy="60" r="36" fill="#ffffff"/></svg>',
        'utf-8'
      );
      const svgToPng = await postConvertJob(svgBuf, 'vektor.svg', 'png', 'image/svg+xml');
      expect(svgToPng.status).toBe(201);

      for (const [buf, name, mime] of [
        [bmpToPng.outBuf!, 'scan_halaman.png', 'image/png'],
        [svgBuf, 'diagram_arsitektur.svg', 'image/svg+xml'],
      ] as const) {
        const pdfRes = await postConvertJob(buf, name, 'pdf', mime);
        expect(pdfRes.status).toBe(201);
        const loadedPdf = await PDFDocument.load(pdfRes.outBuf!);
        expect(loadedPdf.getPageCount()).toBe(1);
      }

      // TIFF -> AVIF
      const tiffBuf = await sharp(bmpToPng.outBuf!).tiff().toBuffer();
      const avifRes = await postConvertJob(tiffBuf, 'arsip_citra.tiff', 'avif', 'image/tiff');
      expect(avifRes.status).toBe(201);
      expect(avifRes.outBuf!.length).toBeGreaterThan(32);
    }, 45000);

    it('converts DOCX, PPTX (with PNG+JPG), wide sparse XLSX (15 cols), FlateDecode PDF, ODT, RTF, and TXT/MD/HTML -> OpenXML DOCX, while rejecting binary OLE2 .doc honestly', async () => {
      // 1. Rich DOCX -> PDF, HTML, TXT, MD
      const docxBuf = await createRichDocxBuffer(false);
      const docxPdf = await postConvertJob(docxBuf, 'audit.docx', 'pdf');
      expect(docxPdf.status).toBe(201);
      const parsedDocxPdf = await PDFDocument.load(docxPdf.outBuf!);
      expect(parsedDocxPdf.getPageCount()).toBeGreaterThanOrEqual(1);

      const docxHtml = await postConvertJob(docxBuf, 'audit.docx', 'html');
      expect(docxHtml.status).toBe(201);
      const htmlStr = docxHtml.outBuf!.toString('utf-8');
      expect(htmlStr).toContain('&#039;FileFlow&#039;');
      expect(htmlStr).toContain('&quot;Nusa&quot;');
      expect(htmlStr).not.toContain('&amp;apos;');

      const docxTxt = await postConvertJob(docxBuf, 'audit.docx', 'txt');
      expect(docxTxt.status).toBe(201);
      expect(docxTxt.outBuf!.toString('utf-8')).toContain("Laporan Audit Sistem 'FileFlow'");

      const docxMd = await postConvertJob(docxBuf, 'audit.docx', 'md');
      expect(docxMd.status).toBe(201);
      expect(docxMd.outBuf!.toString('utf-8')).toContain('# Laporan Audit Sistem');

      // 2. PPTX with PNG + JPG slides -> PDF
      const pptxBuf = await createRichPptxWithPngAndJpg();
      const pptxPdf = await postConvertJob(pptxBuf, 'presentasi.pptx', 'pdf');
      expect(pptxPdf.status).toBe(201);
      const parsedPptxPdf = await PDFDocument.load(pptxPdf.outBuf!);
      expect(parsedPptxPdf.getPageCount()).toBeGreaterThanOrEqual(2);

      // 3. Wide Sparse 15-Column XLSX -> PDF, CSV, JSON
      const xlsxBuf = await createWideSparseXlsxBuffer(false);
      const xlsxPdf = await postConvertJob(xlsxBuf, 'rekap_15_kolom.xlsx', 'pdf');
      expect(xlsxPdf.status).toBe(201);
      const parsedXlsxPdf = await PDFDocument.load(xlsxPdf.outBuf!);
      expect(parsedXlsxPdf.getPageCount()).toBeGreaterThanOrEqual(1);

      const xlsxCsv = await postConvertJob(xlsxBuf, 'rekap_15_kolom.xlsx', 'csv');
      expect(xlsxCsv.status).toBe(201);
      const csvLines = xlsxCsv.outBuf!.toString('utf-8').trim().split(/\r?\n/);
      expect(csvLines[0]).toContain('Kolom_15');
      const row2Cols = csvLines[1]!.split(',');
      expect(row2Cols[4]).toContain('Nilai_Kolom_5');
      expect(row2Cols[14]).toContain('98765.43');

      const xlsxJson = await postConvertJob(xlsxBuf, 'rekap_15_kolom.xlsx', 'json');
      expect(xlsxJson.status).toBe(201);
      const parsedXlsxJson = JSON.parse(xlsxJson.outBuf!.toString('utf-8'));
      expect(Array.isArray(parsedXlsxJson)).toBe(true);

      // 4. FlateDecode compressed PDF -> TXT, HTML, MD
      const flatePdf = await createFlateCompressedPdfBuffer([
        'Kalimat rahasia di dalam stream FlateDecode zlib.',
        'Baris verifikasi ekstraksi teks kedua.',
      ]);
      for (const target of ['txt', 'html', 'md'] as const) {
        const extracted = await postConvertJob(flatePdf, 'dokumen_zlib.pdf', target);
        expect(extracted.status).toBe(201);
        expect(extracted.outBuf!.toString('utf-8')).toContain(
          'Kalimat rahasia di dalam stream FlateDecode'
        );
      }

      // 5. TXT, MD, HTML -> genuine OpenXML DOCX (re-parsed via parseDocx)
      const mdSource = Buffer.from(
        '# Panduan Operasional\n\nParagraf utama panduan sistem.\n\n- Butir satu\n- Butir dua\n',
        'utf-8'
      );
      const mdToDocx = await postConvertJob(mdSource, 'panduan.md', 'docx', 'text/markdown');
      expect(mdToDocx.status).toBe(201);
      const reparsedDocxText = joinDocSections(parseDocx(mdToDocx.outBuf!));
      expect(reparsedDocxText).toContain('Panduan Operasional');
      expect(reparsedDocxText).toContain('Butir satu');

      const htmlSource = Buffer.from(
        '<!DOCTYPE html><html><body><h1>Kontrak Layanan</h1><p>Pasal kesatu berlaku efektif.</p></body></html>',
        'utf-8'
      );
      const htmlToDocx = await postConvertJob(htmlSource, 'kontrak.html', 'docx', 'text/html');
      expect(htmlToDocx.status).toBe(201);
      expect(joinDocSections(parseDocx(htmlToDocx.outBuf!))).toContain('Kontrak Layanan');

      // 6. ODT & RTF -> PDF, DOCX, TXT
      const odtBuf = createRichOdtBuffer();
      const odtPdf = await postConvertJob(odtBuf, 'memo.odt', 'pdf');
      expect(odtPdf.status).toBe(201);
      expect((await PDFDocument.load(odtPdf.outBuf!)).getPageCount()).toBeGreaterThanOrEqual(1);

      const odtDocx = await postConvertJob(odtBuf, 'memo.odt', 'docx');
      expect(odtDocx.status).toBe(201);
      expect(joinDocSections(parseDocx(odtDocx.outBuf!))).toContain(
        'Dokumen Standar OpenDocument'
      );

      const rtfBuf = createRichRtfBuffer();
      const rtfTxt = await postConvertJob(rtfBuf, 'surat.rtf', 'txt');
      expect(rtfTxt.status).toBe(201);
      expect(rtfTxt.outBuf!.toString('utf-8')).toContain('Dokumen Resmi RTF FileFlow');

      const rtfDocx = await postConvertJob(rtfBuf, 'surat.rtf', 'docx');
      expect(rtfDocx.status).toBe(201);
      expect(joinDocSections(parseDocx(rtfDocx.outBuf!))).toContain(
        'Dokumen Resmi RTF FileFlow'
      );

      // 7. Legacy OLE2 binary .doc (D0 CF 11 E0 A1 B1 1A E1) -> honest failure when LibreOffice absent
      const fakeOle2Doc = Buffer.concat([
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
        Buffer.alloc(512, 0x00),
      ]);
      const ole2Res = await postConvertJob(fakeOle2Doc, 'warisan_97.doc', 'pdf');
      expect([400, 422]).toContain(ole2Res.status);
    }, 45000);

    it('converts multiline RFC 4180 CSV, XML with attributes/arrays/CDATA, nested YAML, and exports CSV/JSON -> XLSX & PDF', async () => {
      const multilineCsv = Buffer.from(
        'id,nama,catatan\n1,"Budi, S.T.","Baris 1\nBaris 2 dengan ""kutip"""\n2,"Siti Aminah","Normal"\n',
        'utf-8'
      );

      const csvToJson = await postConvertJob(multilineCsv, 'peserta.csv', 'json', 'text/csv');
      expect(csvToJson.status).toBe(201);
      const rows = JSON.parse(csvToJson.outBuf!.toString('utf-8')) as Array<
        Record<string, string>
      >;
      expect(rows).toHaveLength(2);
      expect(rows[0]?.nama).toBe('Budi, S.T.');
      expect(rows[0]?.catatan).toContain('Baris 2 dengan "kutip"');

      // CSV -> genuine OpenXML XLSX (re-parsed via parseXlsx)
      const csvToXlsx = await postConvertJob(multilineCsv, 'peserta.csv', 'xlsx', 'text/csv');
      expect(csvToXlsx.status).toBe(201);
      const parsedWb = parseXlsx(csvToXlsx.outBuf!);
      expect(parsedWb.rows.length).toBeGreaterThanOrEqual(3);

      // JSON -> XLSX
      const jsonToXlsx = await postConvertJob(
        csvToJson.outBuf!,
        'peserta.json',
        'xlsx',
        'application/json'
      );
      expect(jsonToXlsx.status).toBe(201);
      expect(parseXlsx(jsonToXlsx.outBuf!).rows[1]?.[1]).toBe('Budi, S.T.');

      // XML with attributes + repeated tags + CDATA -> JSON (single-root unwrapped)
      const richXml = Buffer.from(
        '<?xml version="1.0" encoding="UTF-8"?><catalog region="ID"><item code="A1"><title><![CDATA[Modul <Inti>]]></title></item><item code="A2"><title>Modul Kedua</title></item></catalog>',
        'utf-8'
      );
      const xmlToJson = await postConvertJob(richXml, 'katalog.xml', 'json', 'application/xml');
      expect(xmlToJson.status).toBe(201);
      const xmlObj = JSON.parse(xmlToJson.outBuf!.toString('utf-8'));
      expect(xmlObj['@region']).toBe('ID');
      expect(Array.isArray(xmlObj.item)).toBe(true);
      expect(xmlObj.item).toHaveLength(2);
      expect(xmlObj.item[0].title).toBe('Modul <Inti>');

      // Nested YAML -> JSON & TXT -> MD (no raw JSON dump)
      const yamlBuf = Buffer.from(
        'service: fileflow\nlimits:\n  maxMb: 50\n  formats:\n    - pdf\n    - docx\n    - webp\n',
        'utf-8'
      );
      const yamlToJson = await postConvertJob(yamlBuf, 'konfigurasi.yaml', 'json', 'text/yaml');
      expect(yamlToJson.status).toBe(201);
      const yamlParsed = JSON.parse(yamlToJson.outBuf!.toString('utf-8'));
      expect(yamlParsed.service).toBe('fileflow');
      expect(yamlParsed.limits.formats).toEqual(['pdf', 'docx', 'webp']);

      const plainTxt = Buffer.from('Catatan Harian\nBaris kedua bersih.', 'utf-8');
      const txtToMd = await postConvertJob(plainTxt, 'catatan.txt', 'md', 'text/plain');
      expect(txtToMd.status).toBe(201);
      const mdOut = txtToMd.outBuf!.toString('utf-8');
      expect(mdOut).not.toContain('{"lines"');
      expect(mdOut).toContain('Catatan Harian');
    }, 30000);

    it('transcodes audio/video formats via FFmpeg, handles odd 321x241 WebM -> MP4, and rejects silent MP4 -> MP3 honestly', async () => {
      if (!hasFfmpeg) return;

      const mp4WithAudio = await generateFfmpegSample('sample_av.mp4', [
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=320x240:rate=15',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=44100',
        '-t',
        '1.0',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
      ]);

      for (const target of ['webm', 'mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] as const) {
        const res = await postConvertJob(mp4WithAudio, 'klip_utama.mp4', target, 'video/mp4');
        expect(res.status).toBe(201);
        expect(res.outBuf!.length).toBeGreaterThan(256);
      }

      // Odd dimensions 321x241 WebM -> MP4 (H.264 requires even dimensions)
      const oddWebm = await generateFfmpegSample('odd_321x241.webm', [
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=321x241:rate=15',
        '-t',
        '0.8',
        '-c:v',
        'libvpx-vp9',
      ]);
      const oddToMp4 = await postConvertJob(oddWebm, 'ganjil.webm', 'mp4', 'video/webm');
      expect(oddToMp4.status).toBe(201);
      expect(oddToMp4.outBuf!.length).toBeGreaterThan(512);

      // Silent MP4 (no audio stream) -> MP3 must return 422 honestly
      const silentMp4 = await generateFfmpegSample('silent_only.mp4', [
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=160x120:rate=12',
        '-t',
        '0.8',
        '-an',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
      ]);
      const silentToMp3 = await postConvertJob(silentMp4, 'bisu.mp4', 'mp3', 'video/mp4');
      expect(silentToMp3.status).toBe(422);
    }, 90000);

    it('processes a 35-file multi-format simultaneous batch conversion and bundles all 35 outputs into a valid UTF-8 .ZIP', async () => {
      const pngSample = await createAlphaPng(64, 64);
      const docxSample = await createRichDocxBuffer(false);
      const xlsxSample = await createWideSparseXlsxBuffer(false);
      const odtSample = createRichOdtBuffer();
      const rtfSample = createRichRtfBuffer();

      const batchInputs: Array<{ buf: Buffer; name: string; target: string }> = [];
      for (let i = 1; i <= 10; i++) {
        batchInputs.push({ buf: pngSample, name: `citra_batch_${i}.png`, target: 'webp' });
      }
      for (let i = 1; i <= 5; i++) {
        batchInputs.push({ buf: pngSample, name: `ikon_batch_${i}.png`, target: 'bmp' });
      }
      for (let i = 1; i <= 5; i++) {
        batchInputs.push({ buf: docxSample, name: `laporan_batch_${i}.docx`, target: 'pdf' });
      }
      for (let i = 1; i <= 5; i++) {
        batchInputs.push({ buf: xlsxSample, name: `neraca_batch_${i}.xlsx`, target: 'csv' });
      }
      for (let i = 1; i <= 5; i++) {
        batchInputs.push({
          buf: Buffer.from(`id,nilai\n${i},${i * 100}\n`, 'utf-8'),
          name: `data_batch_${i}.csv`,
          target: 'json',
        });
      }
      batchInputs.push({ buf: odtSample, name: 'dokumen_odt_1.odt', target: 'txt' });
      batchInputs.push({ buf: rtfSample, name: 'dokumen_rtf_1.rtf', target: 'html' });
      batchInputs.push({
        buf: Buffer.from('# Judul Batch\n\nIsi ringkas.\n', 'utf-8'),
        name: 'catatan_1.md',
        target: 'docx',
      });
      batchInputs.push({
        buf: Buffer.from('key: value\ncount: 42\n', 'utf-8'),
        name: 'konfig_1.yaml',
        target: 'json',
      });
      batchInputs.push({
        buf: Buffer.from('<root><status>ok</status></root>', 'utf-8'),
        name: 'data_1.xml',
        target: 'json',
      });

      expect(batchInputs).toHaveLength(35);

      const completed = await Promise.all(
        batchInputs.map(async (entry) => {
          const res = await postConvertJob(entry.buf, entry.name, entry.target);
          expect(res.status).toBe(201);
          const jobObj = res.body.job as { id: string };
          return {
            jobId: jobObj.id,
            token: res.body.ownerToken as string,
          };
        })
      );

      const zipReq = new NextRequest('http://localhost:3000/api/jobs/batch-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: completed,
          zipFilename: 'bundel_35_konversi.zip',
        }),
      });
      const zipRes = await batchZipHandler(zipReq);
      expect(zipRes.status).toBe(200);
      const zipJson = await zipRes.json();
      trackJob(zipJson.job.id, zipJson.ownerToken);

      const dlZipReq = new NextRequest(
        `http://localhost:3000/api/jobs/${zipJson.job.id}/download?token=${zipJson.ownerToken}`
      );
      const dlZipRes = await downloadJobHandler(dlZipReq, {
        params: { id: zipJson.job.id },
      });
      expect(dlZipRes.status).toBe(200);
      const zipBuf = Buffer.from(await dlZipRes.arrayBuffer());

      // Check UTF-8 General Purpose Bit Flag 0x0800 at offset 6 of first Local File Header
      expect(zipBuf.readUInt16LE(6) & 0x0800).toBe(0x0800);

      const reader = new ZipReader(zipBuf);
      expect(reader.listFiles()).toHaveLength(35);
    }, 60000);
  });

  // =========================================================================
  // SYSTEM 2: KOMPRES (16 Formats x 3 Levels + Media FFmpeg + 25-File Batch)
  // =========================================================================
  describe('System 2: Kompresi Terukur (50+ Eksekusi Multi-Format + Batch 25 Berkas)', () => {
    it('genuinely shrinks image-heavy PDFs, DOCX/XLSX media bundles, raster/animated images, HTML (<pre> safe), data, and FFmpeg video/audio across low/recommended/extreme', async () => {
      // 1. Image-heavy 2-page PDF across all 3 levels -> real size reduction & valid 2-page PDF
      const heavyPdf = await createImageHeavyPdfBuffer();
      for (const lv of ['low', 'recommended', 'extreme'] as const) {
        const res = await postCompressJob(heavyPdf, 'katalog_foto.pdf', lv, 'application/pdf');
        expect(res.status).toBe(200);
        expect(res.outBuf!.length).toBeLessThanOrEqual(heavyPdf.length);
        if (lv !== 'low') {
          expect(res.outBuf!.length).toBeLessThan(Math.round(heavyPdf.length * 0.8));
        }
        const loaded = await PDFDocument.load(res.outBuf!);
        expect(loaded.getPageCount()).toBe(2);
      }

      // 2. Image-heavy DOCX & XLSX -> real size savings & intact document text
      const heavyDocx = await createRichDocxBuffer(true);
      const compDocx = await postCompressJob(heavyDocx, 'proposal_bergambar.docx', 'recommended');
      expect(compDocx.status).toBe(200);
      expect(compDocx.outBuf!.length).toBeLessThan(Math.round(heavyDocx.length * 0.8));
      expect(joinDocSections(parseDocx(compDocx.outBuf!))).toContain('Laporan Audit Sistem');

      const heavyXlsx = await createWideSparseXlsxBuffer(true);
      const compXlsx = await postCompressJob(heavyXlsx, 'neraca_bergambar.xlsx', 'extreme');
      expect(compXlsx.status).toBe(200);
      expect(compXlsx.outBuf!.length).toBeLessThan(Math.round(heavyXlsx.length * 0.75));
      expect(parseXlsx(compXlsx.outBuf!).rows.length).toBe(2);

      // 3. Noisy JPEG, Alpha PNG, Animated GIF (3 frames) & Animated WebP (3 frames)
      const noisyJpg = await createNoisyPhotoJpeg(640, 480, 98);
      const jpgLow = await postCompressJob(noisyJpg, 'foto.jpg', 'low', 'image/jpeg');
      const jpgExt = await postCompressJob(noisyJpg, 'foto.jpg', 'extreme', 'image/jpeg');
      expect(jpgLow.outBuf!.length).toBeLessThan(noisyJpg.length);
      expect(jpgExt.outBuf!.length).toBeLessThan(jpgLow.outBuf!.length);

      const alphaPng = await createAlphaPng(160, 160);
      const compAlpha = await postCompressJob(alphaPng, 'logo_alpha.png', 'recommended', 'image/png');
      expect(compAlpha.status).toBe(200);
      expect((await sharp(compAlpha.outBuf!).metadata()).hasAlpha).toBe(true);

      const animGif = await createAnimatedGif3Frames();
      const compAnimGif = await postCompressJob(animGif, 'stiker.gif', 'recommended', 'image/gif');
      expect(compAnimGif.status).toBe(200);
      expect((await sharp(compAnimGif.outBuf!, { animated: true }).metadata()).pages).toBe(3);

      const animWebp = await sharp(animGif, { animated: true })
        .webp({ quality: 98, effort: 1 })
        .toBuffer();
      const compAnimWebp = await postCompressJob(
        animWebp,
        'stiker.webp',
        'extreme',
        'image/webp'
      );
      expect(compAnimWebp.status).toBe(200);
      expect((await sharp(compAnimWebp.outBuf!, { animated: true }).metadata()).pages).toBe(3);

      // 4. HTML minifier MUST preserve indentation inside <pre><code> while stripping comments
      const htmlWithPre = Buffer.from(
        `<!DOCTYPE html>\n<!-- Komentar besar yang harus dibuang ${'x'.repeat(300)} -->\n<html>\n  <body>\n    <h1>Judul   Dokumen</h1>\n    <pre><code>def hitung():\n    return 42\n</code></pre>\n  </body>\n</html>`,
        'utf-8'
      );
      const compHtml = await postCompressJob(htmlWithPre, 'halaman.html', 'recommended', 'text/html');
      expect(compHtml.status).toBe(200);
      const compHtmlText = compHtml.outBuf!.toString('utf-8');
      expect(compHtmlText.length).toBeLessThan(htmlWithPre.length);
      expect(compHtmlText).toContain('def hitung():\n    return 42');
      expect(compHtmlText).not.toContain('Komentar besar');

      // 5. JSON compression
      const prettyJson = Buffer.from(
        JSON.stringify(
          Array.from({ length: 40 }, (_, idx) => ({
            nomor: idx + 1,
            keterangan: 'Data terstruktur dengan indentasi lebar',
          })),
          null,
          4
        ),
        'utf-8'
      );
      const compJson = await postCompressJob(prettyJson, 'payload.json', 'extreme', 'application/json');
      expect(compJson.status).toBe(200);
      expect(compJson.outBuf!.length).toBeLessThan(prettyJson.length);
      expect(JSON.parse(compJson.outBuf!.toString('utf-8'))).toHaveLength(40);

      // 6. FFmpeg Video (MP4) & Audio (MP3) compression
      if (hasFfmpeg) {
        const highBitrateMp4 = await generateFfmpegSample('uncompressed_high.mp4', [
          '-f',
          'lavfi',
          '-i',
          'testsrc=size=480x360:rate=24',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:sample_rate=44100',
          '-t',
          '1.5',
          '-c:v',
          'libx264',
          '-crf',
          '10',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '256k',
        ]);
        const compMp4 = await postCompressJob(
          highBitrateMp4,
          'rekaman_tinggi.mp4',
          'extreme',
          'video/mp4'
        );
        expect(compMp4.status).toBe(200);
        expect(compMp4.outBuf!.length).toBeLessThan(highBitrateMp4.length);

        const highBitrateMp3 = await generateFfmpegSample('audio_320k.mp3', [
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=520:sample_rate=44100',
          '-t',
          '2.0',
          '-c:a',
          'libmp3lame',
          '-b:a',
          '320k',
        ]);
        const compMp3 = await postCompressJob(
          highBitrateMp3,
          'musik_320k.mp3',
          'extreme',
          'audio/mpeg'
        );
        expect(compMp3.status).toBe(200);
        expect(compMp3.outBuf!.length).toBeLessThan(highBitrateMp3.length);
      }

      // 7. Unsupported formats (.ico) rejected cleanly with 400
      const unsupportedIco = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x00, 0x00]);
      const badIcoComp = await postCompressJob(unsupportedIco, 'ikon.ico', 'recommended');
      expect(badIcoComp.status).toBe(400);
    }, 90000);

    it('compresses a 25-file mixed batch and packages all 25 compressed outputs into .ZIP', async () => {
      const baseJpg = await createNoisyPhotoJpeg(320, 240, 96);
      const batchJobs: Array<{ jobId: string; token: string }> = [];

      for (let i = 1; i <= 25; i++) {
        const isJson = i % 5 === 0;
        const buf = isJson
          ? Buffer.from(JSON.stringify({ index: i, items: [1, 2, 3, 4, 5] }, null, 4), 'utf-8')
          : baseJpg;
        const name = isJson ? `konfig_${i}.json` : `galeri_${i}.jpg`;
        const res = await postCompressJob(buf, name, 'recommended');
        expect(res.status).toBe(200);
        const jobObj = res.body.job as { id: string };
        batchJobs.push({ jobId: jobObj.id, token: res.body.ownerToken as string });
      }

      const zipReq = new NextRequest('http://localhost:3000/api/jobs/batch-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: batchJobs,
          zipFilename: 'batch_25_kompresi.zip',
        }),
      });
      const zipRes = await batchZipHandler(zipReq);
      expect(zipRes.status).toBe(200);
      const zipData = await zipRes.json();
      trackJob(zipData.job.id, zipData.ownerToken);

      const dlReq = new NextRequest(
        `http://localhost:3000/api/jobs/${zipData.job.id}/download?token=${zipData.ownerToken}`
      );
      const dlRes = await downloadJobHandler(dlReq, { params: { id: zipData.job.id } });
      const reader = new ZipReader(Buffer.from(await dlRes.arrayBuffer()));
      expect(reader.listFiles()).toHaveLength(25);
    }, 45000);
  });

  // =========================================================================
  // SYSTEM 3: HAPUS BG, CLIENT ZIP & LIFECYCLE PURGE (20-File Batch + Sobel)
  // =========================================================================
  describe('System 3: Isolasi Latar Belakang CIE-Lab/Sobel, Batch 20 Gambar & Penghapusan', () => {
    it('protects interior white shirts on studio white walls and preserves dark hair on already-transparent PNGs onto KTP Red & Passport Blue', async () => {
      // 1. White-shirt portrait on white wall (#f8fafc)
      const portraitBuf = await createWhiteShirtPortraitPng();
      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array(portraitBuf)], { type: 'image/png' }),
        'pas_foto_kemeja_putih.png'
      );
      form.append('mode', 'transparent');
      form.append('tolerance', '38');

      const res = await bgRemovalHandler(
        new NextRequest('http://localhost:3000/api/background-removal', {
          method: 'POST',
          body: form,
        })
      );
      expect(res.status).toBe(201);
      const data = await res.json();
      trackJob(data.job.id, data.ownerToken);

      const dlRes = await downloadJobHandler(
        new NextRequest(
          `http://localhost:3000/api/jobs/${data.job.id}/download?token=${data.ownerToken}`
        ),
        { params: { id: data.job.id } }
      );
      const outPng = Buffer.from(await dlRes.arrayBuffer());
      const { data: rawPixels, info } = await sharp(outPng)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Top-left wall pixel (4, 4) -> alpha === 0 (removed)
      const wallIdx = (4 * info.width + 4) * 4;
      expect(rawPixels[wallIdx + 3]).toBe(0);

      // Center of white shirt (80, 120) -> alpha === 255 (protected by dark jacket Sobel barrier)
      const shirtIdx = (120 * info.width + 80) * 4;
      expect(rawPixels[shirtIdx + 3]).toBe(255);
      expect(rawPixels[shirtIdx]).toBeGreaterThan(240);

      // 2. Already-transparent dark-hair PNG -> KTP Red (#dc2626) & Passport Blue (#1e40af)
      const cutoutDark = await createCutoutDarkHairPng();
      for (const [hex, expectedR, expectedB] of [
        ['#dc2626', 220, 38],
        ['#1e40af', 30, 175],
      ] as const) {
        const solidForm = new FormData();
        solidForm.append(
          'file',
          new Blob([new Uint8Array(cutoutDark)], { type: 'image/png' }),
          'subjek_rambut_hitam.png'
        );
        solidForm.append('mode', 'solid');
        solidForm.append('replacementColor', hex);

        const solidRes = await bgRemovalHandler(
          new NextRequest('http://localhost:3000/api/background-removal', {
            method: 'POST',
            body: solidForm,
          })
        );
        expect(solidRes.status).toBe(201);
        const solidJson = await solidRes.json();
        trackJob(solidJson.job.id, solidJson.ownerToken);

        const solidDl = await downloadJobHandler(
          new NextRequest(
            `http://localhost:3000/api/jobs/${solidJson.job.id}/download?token=${solidJson.ownerToken}`
          ),
          { params: { id: solidJson.job.id } }
        );
        const solidPixels = await sharp(Buffer.from(await solidDl.arrayBuffer()))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        // Outer corner (4, 4) matches KTP Red or Passport Blue
        const corner = (4 * solidPixels.info.width + 4) * 4;
        expect(Math.abs((solidPixels.data[corner] ?? 0) - expectedR)).toBeLessThan(8);
        expect(Math.abs((solidPixels.data[corner + 2] ?? 0) - expectedB)).toBeLessThan(8);

        // Center dark hair (60, 60) remains dark (< 35), NOT replaced
        const center = (60 * solidPixels.info.width + 60) * 4;
        expect(solidPixels.data[center]).toBeLessThan(35);
        expect(solidPixels.data[center + 1]).toBeLessThan(35);
        expect(solidPixels.data[center + 2]).toBeLessThan(35);
      }
    }, 30000);

    it('processes a 20-image batch BG removal into .ZIP, validates Client ZIP UTF-8 CRC-32, and enforces HTTP 410 expiry & storage sweep', async () => {
      const portrait = await createWhiteShirtPortraitPng();
      const bgJobs: Array<{ jobId: string; token: string }> = [];

      for (let i = 1; i <= 20; i++) {
        const form = new FormData();
        form.append(
          'file',
          new Blob([new Uint8Array(portrait)], { type: 'image/png' }),
          `karyawan_${i}.png`
        );
        form.append('mode', i % 2 === 0 ? 'solid' : 'transparent');
        if (i % 2 === 0) {
          form.append('replacementColor', '#dc2626');
        }
        const res = await bgRemovalHandler(
          new NextRequest('http://localhost:3000/api/background-removal', {
            method: 'POST',
            body: form,
          })
        );
        expect(res.status).toBe(201);
        const json = await res.json();
        trackJob(json.job.id, json.ownerToken);
        bgJobs.push({ jobId: json.job.id, token: json.ownerToken });
      }

      const zipRes = await batchZipHandler(
        new NextRequest('http://localhost:3000/api/jobs/batch-zip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: bgJobs, zipFilename: 'pas_foto_20.zip' }),
        })
      );
      expect(zipRes.status).toBe(200);
      const zipJson = await zipRes.json();
      trackJob(zipJson.job.id, zipJson.ownerToken);

      // Verify Client-Side Privacy Mode ZIP builder (12 filenames with duplicate resolution)
      const clientZipBlob = buildClientZipBlob(
        Array.from({ length: 12 }, (_, idx) => ({
          filename: idx < 2 ? 'pas foto ktp.png' : `dokumen_rahasia_${idx + 1}.json`,
          data: new Uint8Array(Buffer.from(`isi_${idx}`, 'utf-8')),
        }))
      );
      const clientZipBuf = Buffer.from(await clientZipBlob.arrayBuffer());
      expect(clientZipBuf.readUInt16LE(6) & 0x0800).toBe(0x0800);
      const clientZipReader = new ZipReader(clientZipBuf);
      const clientNames = clientZipReader.listFiles();
      expect(clientNames).toHaveLength(12);
      expect(clientNames).toContain('pas foto ktp.png');
      expect(clientNames).toContain('pas foto ktp_2.png');

      // Verify TTL Expiry -> HTTP 410 & immediate disk cleanup
      const targetExpired = bgJobs[0]!;
      const meta = await readJobMeta(targetExpired.jobId);
      expect(meta).not.toBeNull();
      await writeJobMeta(targetExpired.jobId, {
        ...meta!,
        expiresAt: new Date(Date.now() - 5000).toISOString(),
      });

      const pollExpired = await getJobHandler(
        new NextRequest(`http://localhost:3000/api/jobs/${targetExpired.jobId}`, {
          headers: { 'X-Session-Token': targetExpired.token },
        }),
        { params: { id: targetExpired.jobId } }
      );
      expect(pollExpired.status).toBe(410);
      expect(fs.existsSync(getJobDir(targetExpired.jobId))).toBe(false);
    }, 60000);
  });

  // =========================================================================
  // SYSTEM 4: UNDUH MEDIA, SSRF DEFENSE & RFC 5987 HEADERS
  // =========================================================================
  describe('System 4: Ekstraksi Media Publik, Proteksi 20 Vektor SSRF & Streaming Bersih', () => {
    it('extracts metadata across YouTube (watch, shorts, live, embed), TikTok, Instagram, X, Vimeo and streams downloads with zero temp leak', async () => {
      const publicUrls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://www.youtube.com/shorts/abcdefghijk',
        'https://www.youtube.com/live/abcdefghijk',
        'https://www.youtube.com/embed/abcdefghijk',
        'https://www.tiktok.com/@kreator/video/7234567890123456789',
        'https://www.instagram.com/reel/CxYz1234567/',
        'https://x.com/indonesia/status/1789012345678901234',
        'https://vimeo.com/123456789',
      ];

      for (const url of publicUrls) {
        const res = await downloaderExtractHandler(
          new NextRequest('http://localhost:3000/api/downloader/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          })
        );
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.metadata.availableFormats.length).toBeGreaterThanOrEqual(2);
      }

      // Test streaming GET /api/downloader/download + Content-Disposition header + zero dl_* leak
      const downloadsDir = path.join(getStorageBaseDir(), 'downloads');
      const beforeEntries = fs.existsSync(downloadsDir)
        ? fs.readdirSync(downloadsDir)
        : [];

      const dlUrl =
        'http://localhost:3000/api/downloader/download?url=' +
        encodeURIComponent('https://www.tiktok.com/@studio/video/7234567890123456789') +
        '&format=mp4&quality=1080p&title=' +
        encodeURIComponent('Video Tutorial Konversi Cepat 2026');

      const streamRes = await downloaderStreamHandler(new NextRequest(dlUrl));
      expect(streamRes.status).toBe(200);
      const disp = streamRes.headers.get('Content-Disposition') || '';
      expect(disp).not.toContain('%20');
      expect(disp).toContain("filename*=UTF-8''");

      const mediaBytes = Buffer.from(await streamRes.arrayBuffer());
      expect(mediaBytes.length).toBeGreaterThan(64);

      const afterEntries = fs.existsSync(downloadsDir)
        ? fs.readdirSync(downloadsDir)
        : [];
      expect(afterEntries.length).toBeLessThanOrEqual(beforeEntries.length);

      // Direct unit check on RFC 5987 Content-Disposition builder with spaces
      const customHeader = buildContentDispositionHeader('Laporan Keuangan (Final) 2026.pdf');
      expect(customHeader).toContain('filename="Laporan Keuangan (Final) 2026.pdf"');
      expect(customHeader).not.toContain('filename="Laporan%20');
    }, 30000);

    it('blocks all 20 IPv4, IPv6, IPv4-mapped, 6to4, NAT64, hex-IP, CGNAT, and non-HTTP SSRF attack vectors with HTTP 400', async () => {
      const ssrfVectors = [
        'http://localhost:3000/secret',
        'http://127.0.0.1:8080/video.mp4',
        'http://0.0.0.0/stream',
        'http://10.0.0.15/internal.mp4',
        'http://172.16.10.5/private.mp4',
        'http://192.168.1.254/router.mp4',
        'http://169.254.169.254/latest/meta-data/',
        'http://100.64.0.10/cgnat-internal',
        'http://[::1]:3000/ipv6-loopback',
        'http://[::]/ipv6-unspecified',
        'http://[::ffff:127.0.0.1]/mapped-loopback',
        'http://[::ffff:10.0.0.1]/mapped-rfc1918-a',
        'http://[::ffff:192.168.1.1]/mapped-rfc1918-c',
        'http://[::ffff:169.254.169.254]/mapped-metadata',
        'http://[2002:7f00:0001::1]/6to4-loopback',
        'http://[64:ff9b::127.0.0.1]/nat64-loopback',
        'http://[fc00::1]/unique-local',
        'http://[fe80::1]/link-local',
        'http://0x7f000001/hex-loopback',
        'file:///etc/passwd',
      ];

      for (const maliciousUrl of ssrfVectors) {
        const res = await downloaderExtractHandler(
          new NextRequest('http://localhost:3000/api/downloader/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: maliciousUrl }),
          })
        );
        expect(res.status, `SSRF vector must return 400: ${maliciousUrl}`).toBe(400);
      }
    });
  });

  // =========================================================================
  // SYSTEM 5: PENGELOLA PDF (45-PDF Merge, Split-All ZIP, Ranges & Encryption)
  // =========================================================================
  describe('System 5: Pengelola PDF (Merge 45 Dokumen, Split ZIP/Rentang & Deteksi Enkripsi)', () => {
    it('merges 45 distinct PDF documents in exact order, splits 12-page PDF into .ZIP & custom ranges, and rejects encrypted/corrupt PDFs with HTTP 400', async () => {
      // 1. Merge 45 PDFs (first 15 have 2 pages, next 30 have 1 page = exact 60 pages)
      const mergeForm = new FormData();
      let expectedTotalPages = 0;

      for (let i = 1; i <= 45; i++) {
        const pages = i <= 15 ? 2 : 1;
        expectedTotalPages += pages;
        const pdfBuf = await createFlateCompressedPdfBuffer(
          [`Dokumen Urutan Ke-${i}`],
          pages
        );
        mergeForm.append(
          'files',
          new Blob([new Uint8Array(pdfBuf)], { type: 'application/pdf' }),
          `bagian_${String(i).padStart(2, '0')}.pdf`
        );
      }

      const mergeRes = await pdfMergeHandler(
        new NextRequest('http://localhost:3000/api/pdf/merge', {
          method: 'POST',
          body: mergeForm,
        })
      );
      expect(mergeRes.status).toBe(200);
      const mergeData = await mergeRes.json();
      trackJob(mergeData.job.id, mergeData.ownerToken);

      const mergedDl = await downloadJobHandler(
        new NextRequest(
          `http://localhost:3000/api/jobs/${mergeData.job.id}/download?token=${mergeData.ownerToken}`
        ),
        { params: { id: mergeData.job.id } }
      );
      const mergedPdf = await PDFDocument.load(Buffer.from(await mergedDl.arrayBuffer()));
      expect(mergedPdf.getPageCount()).toBe(expectedTotalPages);

      // 2. Split 12-page PDF -> Mode 'all' (.ZIP with 12 valid 1-page PDFs)
      const source12Pdf = await createFlateCompressedPdfBuffer(
        ['Halaman untuk uji pemisahan'],
        12
      );
      const splitAllForm = new FormData();
      splitAllForm.append(
        'file',
        new Blob([new Uint8Array(source12Pdf)], { type: 'application/pdf' }),
        'buku_12_halaman.pdf'
      );
      splitAllForm.append('mode', 'all');

      const splitAllRes = await pdfSplitHandler(
        new NextRequest('http://localhost:3000/api/pdf/split', {
          method: 'POST',
          body: splitAllForm,
        })
      );
      expect(splitAllRes.status).toBe(200);
      const splitAllData = await splitAllRes.json();
      trackJob(splitAllData.job.id, splitAllData.ownerToken);

      const splitZipDl = await downloadJobHandler(
        new NextRequest(
          `http://localhost:3000/api/jobs/${splitAllData.job.id}/download?token=${splitAllData.ownerToken}`
        ),
        { params: { id: splitAllData.job.id } }
      );
      const splitZipReader = new ZipReader(Buffer.from(await splitZipDl.arrayBuffer()));
      expect(splitZipReader.listFiles()).toHaveLength(12);

      // 3. Split 12-page PDF -> Mode 'range' ("1-3, 6, 9-10" = 6 pages)
      const splitRangeForm = new FormData();
      splitRangeForm.append(
        'file',
        new Blob([new Uint8Array(source12Pdf)], { type: 'application/pdf' }),
        'buku_12_halaman.pdf'
      );
      splitRangeForm.append('mode', 'range');
      splitRangeForm.append('range', '1-3, 6, 9-10');

      const splitRangeRes = await pdfSplitHandler(
        new NextRequest('http://localhost:3000/api/pdf/split', {
          method: 'POST',
          body: splitRangeForm,
        })
      );
      expect(splitRangeRes.status).toBe(200);
      const splitRangeData = await splitRangeRes.json();
      trackJob(splitRangeData.job.id, splitRangeData.ownerToken);

      const rangeDl = await downloadJobHandler(
        new NextRequest(
          `http://localhost:3000/api/jobs/${splitRangeData.job.id}/download?token=${splitRangeData.ownerToken}`
        ),
        { params: { id: splitRangeData.job.id } }
      );
      const rangePdf = await PDFDocument.load(Buffer.from(await rangeDl.arrayBuffer()));
      expect(rangePdf.getPageCount()).toBe(6);

      // 4. Out-of-bounds range "1-99" -> HTTP 400 (NOT 500)
      const badRangeForm = new FormData();
      badRangeForm.append(
        'file',
        new Blob([new Uint8Array(source12Pdf)], { type: 'application/pdf' }),
        'buku_12_halaman.pdf'
      );
      badRangeForm.append('mode', 'range');
      badRangeForm.append('range', '1-99');
      const badRangeRes = await pdfSplitHandler(
        new NextRequest('http://localhost:3000/api/pdf/split', {
          method: 'POST',
          body: badRangeForm,
        })
      );
      expect(badRangeRes.status).toBe(400);

      // 5. Corrupt %PDF-1.4 payload -> HTTP 400 CORRUPT_PDF (both Split and Merge)
      const corruptPdf = Buffer.from('%PDF-1.4\n%%corrupt-payload-not-a-real-xref\n%%EOF', 'utf-8');
      const corruptForm = new FormData();
      corruptForm.append(
        'file',
        new Blob([new Uint8Array(corruptPdf)], { type: 'application/pdf' }),
        'rusak.pdf'
      );
      corruptForm.append('mode', 'all');
      const corruptRes = await pdfSplitHandler(
        new NextRequest('http://localhost:3000/api/pdf/split', {
          method: 'POST',
          body: corruptForm,
        })
      );
      expect(corruptRes.status).toBe(400);

      const corruptMergeForm = new FormData();
      corruptMergeForm.append(
        'files',
        new Blob([new Uint8Array(source12Pdf)], { type: 'application/pdf' }),
        'valid.pdf'
      );
      corruptMergeForm.append(
        'files',
        new Blob([new Uint8Array(corruptPdf)], { type: 'application/pdf' }),
        'rusak.pdf'
      );
      const corruptMergeRes = await pdfMergeHandler(
        new NextRequest('http://localhost:3000/api/pdf/merge', {
          method: 'POST',
          body: corruptMergeForm,
        })
      );
      expect(corruptMergeRes.status).toBe(400);

      // 6. Password-Encrypted PDF (/Encrypt trailer entry) -> HTTP 400 ENCRYPTED_PDF
      const encDoc = await PDFDocument.create();
      encDoc.addPage([400, 400]);
      encDoc.context.trailerInfo.Encrypt = encDoc.context.obj({
        Filter: PDFName.of('Standard'),
        V: 2,
        R: 3,
      });
      const encryptedBytes = Buffer.from(await encDoc.save({ useObjectStreams: false }));

      const encForm = new FormData();
      encForm.append(
        'file',
        new Blob([new Uint8Array(encryptedBytes)], { type: 'application/pdf' }),
        'rahasia_terkunci.pdf'
      );
      encForm.append('mode', 'all');
      const encRes = await pdfSplitHandler(
        new NextRequest('http://localhost:3000/api/pdf/split', {
          method: 'POST',
          body: encForm,
        })
      );
      expect(encRes.status).toBe(400);
      const encJson = await encRes.json();
      expect(encJson.code).toBe('ENCRYPTED_PDF');
    }, 60000);
  });
});
