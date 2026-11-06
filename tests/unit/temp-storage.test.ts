// File: tests/unit/temp-storage.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import {
  initJobDirectory,
  getJobDir,
  writeJobMeta,
  readJobMeta,
  updateJobMeta,
  saveInputFile,
  saveOutputFile,
  getJobInputFilePath,
  getJobOutputFilePath,
  deleteJobDirectory,
  JobMetadata,
} from '@/lib/storage/temp-storage';

describe('Temp Storage Manager Unit Tests', () => {
  const testJobId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';

  beforeEach(async () => {
    await deleteJobDirectory(testJobId);
  });

  afterEach(async () => {
    await deleteJobDirectory(testJobId);
  });

  it('should initialize job directory structure with input, output, and temp subdirectories', async () => {
    const jobDir = await initJobDirectory(testJobId);
    expect(fs.existsSync(jobDir)).toBe(true);
    expect(fs.existsSync(path.join(jobDir, 'input'))).toBe(true);
    expect(fs.existsSync(path.join(jobDir, 'output'))).toBe(true);
    expect(fs.existsSync(path.join(jobDir, 'temp'))).toBe(true);
  });

  it('should write, read, and update job metadata atomically', async () => {
    await initJobDirectory(testJobId);

    const initialMeta: JobMetadata = {
      jobId: testJobId,
      ownerTokenHash: 'dummyhash1234567890abcdef1234567890abcdef1234567890abcdef12345678',
      status: 'queued',
      sourceFormat: 'png',
      targetFormat: 'jpg',
      originalFilename: 'test.png',
      inputFilename: 'test.png',
      inputSizeBytes: 1024,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };

    await writeJobMeta(testJobId, initialMeta);
    const readMeta = await readJobMeta(testJobId);

    expect(readMeta).not.toBeNull();
    expect(readMeta?.jobId).toBe(testJobId);
    expect(readMeta?.status).toBe('queued');

    const updated = await updateJobMeta(testJobId, {
      status: 'succeeded',
      outputFilename: 'test.jpg',
      outputSizeBytes: 800,
    });

    expect(updated.status).toBe('succeeded');
    expect(updated.outputFilename).toBe('test.jpg');

    const reRead = await readJobMeta(testJobId);
    expect(reRead?.status).toBe('succeeded');
    expect(reRead?.outputSizeBytes).toBe(800);
  });

  it('should save input and output files and retrieve their paths', async () => {
    await initJobDirectory(testJobId);

    const inputBuffer = Buffer.from('test input file content');
    const inputResult = await saveInputFile(testJobId, 'sample_image.png', inputBuffer);
    expect(fs.existsSync(inputResult.filePath)).toBe(true);
    expect(inputResult.sizeBytes).toBe(inputBuffer.length);

    const outputBuffer = Buffer.from('test output file content');
    const outputResult = await saveOutputFile(testJobId, 'sample_image.jpg', outputBuffer);
    expect(fs.existsSync(outputResult.filePath)).toBe(true);
    expect(outputResult.sizeBytes).toBe(outputBuffer.length);

    await writeJobMeta(testJobId, {
      jobId: testJobId,
      ownerTokenHash: 'hash',
      status: 'succeeded',
      sourceFormat: 'png',
      targetFormat: 'jpg',
      originalFilename: 'sample_image.png',
      inputFilename: inputResult.sanitizedName,
      outputFilename: outputResult.sanitizedName,
      inputSizeBytes: inputBuffer.length,
      outputSizeBytes: outputBuffer.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
    });

    const retrievedInputPath = await getJobInputFilePath(testJobId);
    expect(retrievedInputPath).toBe(inputResult.filePath);

    const retrievedOutputPath = await getJobOutputFilePath(testJobId);
    expect(retrievedOutputPath).toBe(outputResult.filePath);
  });

  it('should delete job directory completely', async () => {
    const jobDir = await initJobDirectory(testJobId);
    expect(fs.existsSync(jobDir)).toBe(true);

    const deleted = await deleteJobDirectory(testJobId);
    expect(deleted).toBe(true);
    expect(fs.existsSync(jobDir)).toBe(false);
  });

  it('should safely save 20 input files concurrently without filename collision in temp directory', async () => {
    await initJobDirectory(testJobId);

    const concurrencyCount = 20;
    const savePromises = Array.from({ length: concurrencyCount }, (_, i) => {
      const filename = `concurrent_input_${i}.png`;
      const buffer = Buffer.from(`file content index ${i}`);
      return saveInputFile(testJobId, filename, buffer);
    });

    const results = await Promise.allSettled(savePromises);
    const rejections = results.filter((r) => r.status === 'rejected');
    expect(rejections.length).toBe(0);

    for (let i = 0; i < concurrencyCount; i++) {
      const filename = `concurrent_input_${i}.png`;
      const expectedPath = path.join(getJobDir(testJobId), 'input', filename);
      expect(fs.existsSync(expectedPath)).toBe(true);
      const content = await fs.promises.readFile(expectedPath, 'utf-8');
      expect(content).toBe(`file content index ${i}`);
    }

    // Verify temp staging directory has no leftover tmp files
    const tempDir = path.join(getJobDir(testJobId), 'temp');
    const remainingTemp = await fs.promises.readdir(tempDir);
    expect(remainingTemp.filter((f) => f.endsWith('.tmp')).length).toBe(0);
  });

  it('should safely save 20 output files concurrently without filename collision in temp directory', async () => {
    await initJobDirectory(testJobId);

    const concurrencyCount = 20;
    const savePromises = Array.from({ length: concurrencyCount }, (_, i) => {
      const filename = `concurrent_output_${i}.webp`;
      const buffer = Buffer.from(`output content index ${i}`);
      return saveOutputFile(testJobId, filename, buffer);
    });

    const results = await Promise.allSettled(savePromises);
    const rejections = results.filter((r) => r.status === 'rejected');
    expect(rejections.length).toBe(0);

    for (let i = 0; i < concurrencyCount; i++) {
      const filename = `concurrent_output_${i}.webp`;
      const expectedPath = path.join(getJobDir(testJobId), 'output', filename);
      expect(fs.existsSync(expectedPath)).toBe(true);
      const content = await fs.promises.readFile(expectedPath, 'utf-8');
      expect(content).toBe(`output content index ${i}`);
    }
  });

  it('should safely stream multiple input files concurrently without temp file collision', async () => {
    await initJobDirectory(testJobId);

    const streamPromises = Array.from({ length: 10 }, (_, i) => {
      const stream = Readable.from([
        Buffer.from(`streamed chunk 1 for ${i}`),
        Buffer.from(` - chunk 2 for ${i}`)
      ]);
      return saveInputFile(testJobId, `streamed_${i}.bin`, stream);
    });

    const results = await Promise.allSettled(streamPromises);
    const rejections = results.filter((r) => r.status === 'rejected');
    expect(rejections.length).toBe(0);
  });
});
