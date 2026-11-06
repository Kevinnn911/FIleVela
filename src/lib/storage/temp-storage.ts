// File: src/lib/storage/temp-storage.ts

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import {
  assertSafeJobId,
  isValidJobId,
  resolveSafePath,
  sanitizeFilename,
} from './path-sanitizer';

export type JobStatus = 'queued' | 'processing' | 'succeeded' | 'failed' | 'expired';

export interface JobMetadata {
  jobId: string;
  ownerTokenHash: string;
  status: JobStatus;
  sourceFormat: string;
  targetFormat: string;
  originalFilename: string;
  inputFilename: string;
  outputFilename?: string;
  inputSizeBytes: number;
  outputSizeBytes?: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  isTransparent?: boolean;
  error?: {
    code: string;
    message: string;
  } | null;
  metadata?: Record<string, unknown>;
}

const DEFAULT_RETENTION_MS = 60 * 60 * 1000;
const SWEEP_THROTTLE_MS = 30 * 1000;
let lastSweepTimestamp = 0;

export function getStorageBaseDir(): string {
  const envDir = process.env.STORAGE_DIR;
  if (envDir && envDir.trim().length > 0) {
    return path.resolve(envDir.trim());
  }
  return path.resolve(process.cwd(), '.storage');
}

export function getJobDir(jobId: string): string {
  assertSafeJobId(jobId);
  const baseDir = getStorageBaseDir();
  return resolveSafePath(baseDir, path.join('jobs', jobId));
}

export function isJobExpired(meta: JobMetadata, nowMs = Date.now()): boolean {
  if (meta.status === 'expired') {
    return true;
  }
  if (!meta.expiresAt) {
    return false;
  }
  const expiresMs = Date.parse(meta.expiresAt);
  if (Number.isNaN(expiresMs)) {
    return false;
  }
  return expiresMs <= nowMs;
}

export async function safeUnlink(filePath: string, maxRetries = 3, delayMs = 100): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await fs.promises.unlink(filePath);
      return;
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        return;
      }
      if ((error.code === 'EBUSY' || error.code === 'EPERM') && attempt < maxRetries - 1) {
        await new Promise((res) => setTimeout(res, delayMs * Math.pow(2, attempt)));
        continue;
      }
      throw error;
    }
  }
}

export async function safeRmDir(dirPath: string, maxRetries = 3, delayMs = 100): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
      return;
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        return;
      }
      if (
        (error.code === 'EBUSY' || error.code === 'EPERM' || error.code === 'ENOTEMPTY') &&
        attempt < maxRetries - 1
      ) {
        await new Promise((res) => setTimeout(res, delayMs * Math.pow(2, attempt)));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Sweeps expired job folders in `.storage/jobs` and orphaned temporary folders in `.storage/downloads`.
 */
export async function sweepExpiredStorage(options?: {
  force?: boolean;
  maxAgeMs?: number;
  nowMs?: number;
}): Promise<{ purgedJobs: number; purgedDownloads: number }> {
  const nowMs = options?.nowMs ?? Date.now();
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_RETENTION_MS;

  if (!options?.force && nowMs - lastSweepTimestamp < SWEEP_THROTTLE_MS) {
    return { purgedJobs: 0, purgedDownloads: 0 };
  }
  lastSweepTimestamp = nowMs;

  const baseDir = getStorageBaseDir();
  let purgedJobs = 0;
  let purgedDownloads = 0;

  const jobsRoot = path.join(baseDir, 'jobs');
  try {
    const entries = await fs.promises.readdir(jobsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const entryPath = resolveSafePath(jobsRoot, entry.name);
      if (isValidJobId(entry.name)) {
        const meta = await readJobMeta(entry.name).catch(() => null);
        if (meta) {
          if (isJobExpired(meta, nowMs)) {
            await safeRmDir(entryPath).catch(() => {});
            purgedJobs++;
          }
          continue;
        }
      }
      const stat = await fs.promises.stat(entryPath).catch(() => null);
      if (stat && nowMs - stat.mtimeMs >= maxAgeMs) {
        await safeRmDir(entryPath).catch(() => {});
        purgedJobs++;
      }
    }
  } catch {
    // Ignore when jobs directory has not been created yet
  }

  const downloadsRoot = path.join(baseDir, 'downloads');
  try {
    const entries = await fs.promises.readdir(downloadsRoot, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = resolveSafePath(downloadsRoot, entry.name);
      const stat = await fs.promises.stat(entryPath).catch(() => null);
      if (stat && nowMs - stat.mtimeMs >= maxAgeMs) {
        await safeRmDir(entryPath).catch(() => {});
        purgedDownloads++;
      }
    }
  } catch {
    // Ignore when downloads directory has not been created yet
  }

  return { purgedJobs, purgedDownloads };
}

export async function initJobDirectory(jobId: string): Promise<string> {
  void sweepExpiredStorage().catch(() => {});
  const jobDir = getJobDir(jobId);
  await fs.promises.mkdir(path.join(jobDir, 'input'), { recursive: true });
  await fs.promises.mkdir(path.join(jobDir, 'output'), { recursive: true });
  await fs.promises.mkdir(path.join(jobDir, 'temp'), { recursive: true });
  return jobDir;
}

export async function writeJobMeta(jobId: string, meta: JobMetadata): Promise<void> {
  const jobDir = getJobDir(jobId);
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const tmpPath = path.join(jobDir, 'temp', `meta_${Date.now()}_${randomSuffix}.tmp`);
  const targetPath = path.join(jobDir, 'meta.json');

  const jsonContent = JSON.stringify(meta, null, 2);

  try {
    await fs.promises.writeFile(tmpPath, jsonContent, 'utf-8');

    try {
      await fs.promises.rename(tmpPath, targetPath);
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'EPERM' || error.code === 'EEXIST') {
        await safeUnlink(targetPath);
        await fs.promises.rename(tmpPath, targetPath);
      } else {
        throw error;
      }
    }
  } catch (err) {
    await safeUnlink(tmpPath).catch(() => {});
    throw err;
  }
}

export async function readJobMeta(jobId: string): Promise<JobMetadata | null> {
  const jobDir = getJobDir(jobId);
  const metaPath = path.join(jobDir, 'meta.json');

  try {
    const raw = await fs.promises.readFile(metaPath, 'utf-8');
    return JSON.parse(raw) as JobMetadata;
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function updateJobMeta(
  jobId: string,
  updates: Partial<JobMetadata>
): Promise<JobMetadata> {
  const current = await readJobMeta(jobId);
  if (!current) {
    throw new Error(`Job metadata not found for jobId: "${jobId}"`);
  }

  const updated: JobMetadata = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await writeJobMeta(jobId, updated);
  return updated;
}

export async function saveInputFile(
  jobId: string,
  filename: string,
  content: Buffer | Readable
): Promise<{ filePath: string; sizeBytes: number; sanitizedName: string }> {
  const jobDir = getJobDir(jobId);
  const sanitizedName = sanitizeFilename(filename, 'input_file');
  const targetPath = path.join(jobDir, 'input', sanitizedName);
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const tempPath = path.join(jobDir, 'temp', `upload_${Date.now()}_${randomSuffix}.tmp`);

  let sizeBytes = 0;

  try {
    if (Buffer.isBuffer(content)) {
      sizeBytes = content.length;
      await fs.promises.writeFile(tempPath, content);
    } else {
      const writeStream = fs.createWriteStream(tempPath);
      await pipeline(content, writeStream);
      const stat = await fs.promises.stat(tempPath);
      sizeBytes = stat.size;
    }

    try {
      await fs.promises.rename(tempPath, targetPath);
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'EPERM' || error.code === 'EEXIST') {
        await safeUnlink(targetPath);
        await fs.promises.rename(tempPath, targetPath);
      } else {
        throw error;
      }
    }
  } catch (err) {
    await safeUnlink(tempPath).catch(() => {});
    throw err;
  }

  return { filePath: targetPath, sizeBytes, sanitizedName };
}

export async function saveOutputFile(
  jobId: string,
  filename: string,
  content: Buffer | Readable
): Promise<{ filePath: string; sizeBytes: number; sanitizedName: string }> {
  const jobDir = getJobDir(jobId);
  const sanitizedName = sanitizeFilename(filename, 'output_file');
  const targetPath = path.join(jobDir, 'output', sanitizedName);
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const tempPath = path.join(jobDir, 'temp', `output_${Date.now()}_${randomSuffix}.tmp`);

  let sizeBytes = 0;

  try {
    if (Buffer.isBuffer(content)) {
      sizeBytes = content.length;
      await fs.promises.writeFile(tempPath, content);
    } else {
      const writeStream = fs.createWriteStream(tempPath);
      await pipeline(content, writeStream);
      const stat = await fs.promises.stat(tempPath);
      sizeBytes = stat.size;
    }

    try {
      await fs.promises.rename(tempPath, targetPath);
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'EPERM' || error.code === 'EEXIST') {
        await safeUnlink(targetPath);
        await fs.promises.rename(tempPath, targetPath);
      } else {
        throw error;
      }
    }
  } catch (err) {
    await safeUnlink(tempPath).catch(() => {});
    throw err;
  }

  return { filePath: targetPath, sizeBytes, sanitizedName };
}

export async function getJobInputFilePath(jobId: string): Promise<string | null> {
  const meta = await readJobMeta(jobId);
  if (!meta || !meta.inputFilename) {
    return null;
  }
  const jobDir = getJobDir(jobId);
  const inputPath = path.join(jobDir, 'input', meta.inputFilename);
  try {
    await fs.promises.access(inputPath, fs.constants.R_OK);
    return inputPath;
  } catch {
    return null;
  }
}

export async function getJobOutputFilePath(jobId: string): Promise<string | null> {
  const meta = await readJobMeta(jobId);
  if (!meta || !meta.outputFilename) {
    return null;
  }
  const jobDir = getJobDir(jobId);
  const outputPath = path.join(jobDir, 'output', meta.outputFilename);
  try {
    await fs.promises.access(outputPath, fs.constants.R_OK);
    return outputPath;
  } catch {
    return null;
  }
}

export async function deleteJobDirectory(jobId: string): Promise<boolean> {
  const jobDir = getJobDir(jobId);
  try {
    await safeRmDir(jobDir);
    return true;
  } catch {
    return false;
  }
}
