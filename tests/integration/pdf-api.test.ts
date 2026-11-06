// File: tests/integration/pdf-api.test.ts

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { POST as mergePost } from '@/app/api/pdf/merge/route';
import { POST as splitPost } from '@/app/api/pdf/split/route';
import { GET as downloadGet } from '@/app/api/jobs/[id]/download/route';

async function createSamplePdfBlob(pageCount: number, name = 'test.pdf'): Promise<File> {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([300, 400]);
    page.drawText(`Page ${i}`, { x: 50, y: 350 });
  }
  const bytes = await doc.save();
  return new File([Buffer.from(bytes)], name, { type: 'application/pdf' });
}

describe('PDF Tools API Integration Tests', () => {
  describe('POST /api/pdf/merge', () => {
    it('should reject if fewer than 2 files provided', async () => {
      const file1 = await createSamplePdfBlob(1, 'doc1.pdf');
      const formData = new FormData();
      formData.append('files', file1);

      const req = new NextRequest('http://localhost:3000/api/pdf/merge', {
        method: 'POST',
        body: formData,
      });

      const res = await mergePost(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.code).toBe('INSUFFICIENT_FILES');
    });

    it('should successfully merge 2 PDFs and provide a downloadable job', async () => {
      const file1 = await createSamplePdfBlob(2, 'doc1.pdf');
      const file2 = await createSamplePdfBlob(3, 'doc2.pdf');

      const formData = new FormData();
      formData.append('files', file1);
      formData.append('files', file2);

      const req = new NextRequest('http://localhost:3000/api/pdf/merge', {
        method: 'POST',
        body: formData,
      });

      const res = await mergePost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('succeeded');
      expect(json.job).toBeDefined();
      expect(json.job.metadata.totalPages).toBe(5);

      // Verify download endpoint serves the merged PDF
      const downloadReq = new NextRequest(
        `http://localhost:3000/api/jobs/${json.job.id}/download?token=${json.ownerToken}`
      );
      const dlRes = await downloadGet(downloadReq, { params: { id: json.job.id } });
      expect(dlRes.status).toBe(200);
      expect(dlRes.headers.get('Content-Type')).toBe('application/pdf');

      const dlBuffer = Buffer.from(await dlRes.arrayBuffer());
      const loadedDoc = await PDFDocument.load(dlBuffer);
      expect(loadedDoc.getPageCount()).toBe(5);
    });
  });

  describe('POST /api/pdf/split', () => {
    it('should split PDF into zip containing individual pages in mode: all', async () => {
      const file = await createSamplePdfBlob(3, 'sample.pdf');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', 'all');

      const req = new NextRequest('http://localhost:3000/api/pdf/split', {
        method: 'POST',
        body: formData,
      });

      const res = await splitPost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('succeeded');
      expect(json.job.targetFormat).toBe('zip');
      expect(json.job.metadata.extractedCount).toBe(3);

      // Verify download endpoint serves the ZIP
      const downloadReq = new NextRequest(
        `http://localhost:3000/api/jobs/${json.job.id}/download?token=${json.ownerToken}`
      );
      const dlRes = await downloadGet(downloadReq, { params: { id: json.job.id } });
      expect(dlRes.status).toBe(200);
      expect(dlRes.headers.get('Content-Type')).toBe('application/zip');
    });

    it('should split PDF with range and output single extracted PDF', async () => {
      const file = await createSamplePdfBlob(5, 'sample.pdf');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', 'range');
      formData.append('range', '2-3');

      const req = new NextRequest('http://localhost:3000/api/pdf/split', {
        method: 'POST',
        body: formData,
      });

      const res = await splitPost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('succeeded');
      expect(json.job.targetFormat).toBe('pdf');

      const downloadReq = new NextRequest(
        `http://localhost:3000/api/jobs/${json.job.id}/download?token=${json.ownerToken}`
      );
      const dlRes = await downloadGet(downloadReq, { params: { id: json.job.id } });
      expect(dlRes.status).toBe(200);
      expect(dlRes.headers.get('Content-Type')).toBe('application/pdf');

      const dlBuffer = Buffer.from(await dlRes.arrayBuffer());
      const loadedDoc = await PDFDocument.load(dlBuffer);
      expect(loadedDoc.getPageCount()).toBe(2);
    });
  });
});
