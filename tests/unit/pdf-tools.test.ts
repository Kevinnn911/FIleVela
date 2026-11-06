// File: tests/unit/pdf-tools.test.ts

import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  getPdfPageCount,
  mergePdfBuffers,
  splitPdfBuffer,
  parsePageRange,
} from '@/lib/document/pdf-tools';

async function createSamplePdf(pageCount: number, textPrefix = 'Halaman'): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`${textPrefix} ${i}`, { x: 50, y: 550, size: 24 });
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

describe('PDF Power Tools Unit Tests', () => {
  it('should count total pages accurately', async () => {
    const pdfBuf = await createSamplePdf(3);
    const count = await getPdfPageCount(pdfBuf);
    expect(count).toBe(3);
  });

  it('should throw error for empty buffer in getPdfPageCount', async () => {
    await expect(getPdfPageCount(Buffer.alloc(0))).rejects.toThrow('kosong atau tidak valid');
  });

  it('should parse page range strings correctly', () => {
    expect(parsePageRange('1-3, 5', 10)).toEqual([0, 1, 2, 4]);
    expect(parsePageRange('2', 5)).toEqual([1]);
    expect(parsePageRange('1, 2, 3', 3)).toEqual([0, 1, 2]);
    expect(parsePageRange('3-5, 1-2', 5)).toEqual([0, 1, 2, 3, 4]);
  });

  it('should reject invalid page range strings', () => {
    expect(() => parsePageRange('abc', 5)).toThrow('tidak valid');
    expect(() => parsePageRange('5-2', 5)).toThrow('tidak valid');
    expect(() => parsePageRange('10', 5)).toThrow('melebihi jumlah halaman total');
    expect(() => parsePageRange('', 5)).toThrow('tidak boleh kosong');
  });

  it('should merge multiple PDF buffers into a single document in order', async () => {
    const doc1 = await createSamplePdf(2, 'Dokumen A');
    const doc2 = await createSamplePdf(3, 'Dokumen B');

    const merged = await mergePdfBuffers([doc1, doc2]);
    const mergedCount = await getPdfPageCount(merged);

    expect(mergedCount).toBe(5);
  });

  it('should throw error if fewer than 2 PDFs are provided to merge', async () => {
    const doc1 = await createSamplePdf(1);
    await expect(mergePdfBuffers([doc1])).rejects.toThrow('minimal 2 berkas PDF');
  });

  it('should split PDF with mode: all into individual pages', async () => {
    const doc = await createSamplePdf(3, 'MultiPage');
    const results = await splitPdfBuffer(doc, { mode: 'all' }, 'laporan');

    expect(results.length).toBe(3);
    expect(results[0]?.filename).toBe('laporan_halaman_1.pdf');
    expect(results[0]?.pageCount).toBe(1);
    expect(results[1]?.filename).toBe('laporan_halaman_2.pdf');
    expect(results[2]?.filename).toBe('laporan_halaman_3.pdf');

    const firstBuf = results[0]?.buffer;
    expect(firstBuf).toBeDefined();
    if (firstBuf) {
      const p1Count = await getPdfPageCount(firstBuf);
      expect(p1Count).toBe(1);
    }
  });

  it('should split PDF with mode: range into extracted pages', async () => {
    const doc = await createSamplePdf(5, 'MultiPage');
    const results = await splitPdfBuffer(
      doc,
      { mode: 'range', range: '2-4' },
      'ringkasan'
    );

    expect(results.length).toBe(1);
    expect(results[0]?.filename).toBe('ringkasan_hal_2-4.pdf');
    expect(results[0]?.pageCount).toBe(3);

    const rangeBuf = results[0]?.buffer;
    expect(rangeBuf).toBeDefined();
    if (rangeBuf) {
      const count = await getPdfPageCount(rangeBuf);
      expect(count).toBe(3);
    }
  });
});
