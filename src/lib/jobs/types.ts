// File: src/lib/jobs/types.ts

export type JobStatus =
  | "queued"
  | "processing"
  | "succeeded"
  | "failed"
  | "expired";

export type JobType = "conversion" | "background-removal";

export interface JobRecord {
  id: string;
  type: JobType;
  status: JobStatus;
  sourceFilename: string;
  sourceFormat: string;
  targetFormat: string;
  sourceSizeBytes: number;
  outputSizeBytes?: number;
  outputFilename?: string;
  outputMimeType?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  ownerTokenHash: string;
  options?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CreateJobInput {
  type: JobType;
  sourceFilename: string;
  sourceFormat: string;
  targetFormat: string;
  sourceSizeBytes: number;
  options?: Record<string, unknown>;
}

export interface PublicJobInfo {
  id: string;
  type: JobType;
  status: JobStatus;
  sourceFilename: string;
  sourceFormat: string;
  targetFormat: string;
  sourceSizeBytes: number;
  outputSizeBytes?: number;
  outputFilename?: string;
  outputMimeType?: string;
  createdAt: string;
  expiresAt: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
}

