// File: tests/integration/batch-zip-api.test.ts

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { POST as batchZipPost } from '@/app/api/jobs/batch-zip/route';
import { GET as downloadGet } from '@/app/api/jobs/[id]/download/route';
import { generateOwnerToken } from '@/lib/security/token-auth';
import {
  getJobDir,
  initJobDirectory,
  JobMetadata,
  writeJobMeta,
} from '@/lib/storage/temp-storage';
import { resolveSafePath } from '@/lib/storage/path-sanitizer';
import { ZipReader } from '@/lib/document/zip-reader';

async function createMockSucceededJob(filename: string, content: Buffer): Promise<{ jobId: string; token: string }> {
  const jobId = crypto.randomUUID();
  const { token, hash } = generateOwnerToken();
  await initJobDirectory(jobId);

  const jobDir = getJobDir(jobId);
  const outPath = resolveSafePath(jobDir, path.join('output', filename));
  await fs.promises.writeFile(outPath, content);

  const now = new Date();
  const meta: JobMetadata = {
    jobId,
    ownerTokenHash: hash,
    status: 'succeeded',
    sourceFormat: 'txt',
    targetFormat: 'txt',
    originalFilename: filename,
    inputFilename: filename,
    outputFilename: filename,
    inputSizeBytes: content.length,
    outputSizeBytes: content.length,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 3600000).toISOString(),
  };

  await writeJobMeta(jobId, meta);
  return { jobId, token };
}

describe('Batch ZIP API Integration Tests', () => {
  it('should reject when items array is empty', async () => {
    const req = new NextRequest('http://localhost:3000/api/jobs/batch-zip', {
      method: 'POST',
      body: JSON.stringify({ items: [] }),
    });

    const res = await batchZipPost(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe('EMPTY_BATCH_ITEMS');
  });

  it('should bundle multiple completed jobs into a single ZIP archive', async () => {
    const job1 = await createMockSucceededJob('file_satu.txt', Buffer.from('Konten pertama'));
    const job2 = await createMockSucceededJob('file_dua.txt', Buffer.from('Konten kedua'));

    const req = new NextRequest('http://localhost:3000/api/jobs/batch-zip', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          { jobId: job1.jobId, token: job1.token },
          { jobId: job2.jobId, token: job2.token },
        ],
        zipFilename: 'arsip_kumpulan.zip',
      }),
    });

    const res = await batchZipPost(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe('succeeded');
    expect(json.job.targetFormat).toBe('zip');
    expect(json.job.metadata.bundledFilesCount).toBe(2);

    // Verify downloading the zip
    const dlReq = new NextRequest(
      `http://localhost:3000/api/jobs/${json.job.id}/download?token=${json.ownerToken}`
    );
    const dlRes = await downloadGet(dlReq, { params: { id: json.job.id } });
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers.get('Content-Type')).toBe('application/zip');

    const zipBuf = Buffer.from(await dlRes.arrayBuffer());
    const zipReader = new ZipReader(zipBuf);
    const files = zipReader.listFiles();

    expect(files.length).toBe(2);
    expect(files).toContain('file_satu.txt');
    expect(files).toContain('file_dua.txt');

    expect(zipReader.readText('file_satu.txt')).toBe('Konten pertama');
    expect(zipReader.readText('file_dua.txt')).toBe('Konten kedua');
  });
});
