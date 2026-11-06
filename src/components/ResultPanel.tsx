// File: src/components/ResultPanel.tsx

'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  RotateCcw,
  ShieldCheck,
  Trash2,
  TrendingDown,
} from 'lucide-react';

export interface JobResultData {
  id?: string;
  jobId?: string;
  status: 'succeeded' | 'failed';
  sourceFormat: string;
  targetFormat: string;
  originalFilename: string;
  outputFilename?: string;
  sourceSizeBytes?: number;
  inputSizeBytes?: number;
  outputSizeBytes?: number;
  createdAt: string;
  expiresAt: string;
  isTransparent?: boolean;
  durationMs?: number;
  downloadUrl?: string;
  metadata?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
}

interface ResultPanelProps {
  job: JobResultData;
  ownerToken: string;
  onReset: () => void;
  onDeleteJob: (jobId: string, token: string) => Promise<void>;
}

export function ResultPanel({
  job,
  ownerToken,
  onReset,
  onDeleteJob,
}: ResultPanelProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const effectiveJobId = job.id || job.jobId || '';
  const initialBytes = job.sourceSizeBytes ?? job.inputSizeBytes ?? 0;
  const finalBytes = job.outputSizeBytes ?? 0;
  const isClientPrivacy = Boolean(job.metadata?.isClientSidePrivacy);

  const formatFileSize = (bytes?: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const downloadUrl =
    job.downloadUrl ||
    `/api/jobs/${effectiveJobId}/download?token=${encodeURIComponent(
      ownerToken
    )}`;

  const normalizedTarget = (job.targetFormat || '').toLowerCase();
  const isImageOutput = [
    'png',
    'jpg',
    'jpeg',
    'webp',
    'avif',
    'gif',
    'svg',
    'bmp',
    'ico',
  ].includes(normalizedTarget);

  const handleDelete = async () => {
    if (isDeleting || deleteSuccess || !effectiveJobId || isClientPrivacy) {
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteJob(effectiveJobId, ownerToken);
      setDeleteSuccess(true);
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : 'Gagal menghapus berkas dari server.'
      );
      setIsDeleting(false);
    }
  };

  if (job.status === 'failed') {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-red-200 bg-red-50/90 p-6 sm:p-8 text-center"
      >
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-red-200 bg-white text-red-600 shadow-sm">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-[#0a0d14]">
          Pemrosesan Berkas Gagal
        </h3>
        <p className="mt-1 text-xs text-red-900/90 max-w-md mx-auto leading-relaxed">
          {job.error?.message ||
            'Terjadi kendala teknis saat memproses berkas Anda.'}
        </p>
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={onReset}
            className="btn-secondary-light"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Coba Berkas Lain</span>
          </button>
        </div>
      </div>
    );
  }

  const duration =
    job.durationMs || (job.metadata?.durationMs as number | undefined);

  const isSameFormatJob =
    (job.sourceFormat || '').toLowerCase() === normalizedTarget ||
    Boolean(job.metadata?.compressionLevel);

  const savingsPercent =
    initialBytes > 0 && finalBytes > 0 && finalBytes < initialBytes
      ? Math.round(((initialBytes - finalBytes) / initialBytes) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* Status Verification Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-blue-200/80 bg-[#f0f6ff] px-4 py-3">
        <div className="flex items-center gap-2 text-xs sm:text-[13px] font-semibold text-[#0a0d14]">
          <CheckCircle2 className="h-4 w-4 text-[#2563eb] shrink-0" />
          <span>
            {isClientPrivacy
              ? 'Selesai di Memori Browser (0 Byte Unggahan Server)'
              : 'Pemrosesan Selesai & Terverifikasi'}
          </span>
        </div>
        {duration !== undefined && (
          <span className="rounded-full border border-slate-900/10 bg-white px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#0a0d14]">
            {duration} ms
          </span>
        )}
      </div>

      {/* Visual Output Stage */}
      {isImageOutput && !deleteSuccess && (
        <div className="rounded-2xl border border-slate-900/10 bg-[#f6f8fb] p-3.5">
          <div className="flex items-center justify-between mb-2.5 text-xs text-[#4e5666]">
            <span className="inline-flex items-center gap-1.5 font-medium text-[#0a0d14]">
              <Eye className="h-3.5 w-3.5 text-[#2563eb]" />
              <span>Pratinjau Hasil</span>
            </span>
            <span className="font-mono text-[11px] uppercase text-[#4e5666]">
              .{job.targetFormat}
            </span>
          </div>

          <div
            className={`flex items-center justify-center overflow-hidden rounded-xl border border-slate-900/10 p-3 ${
              job.isTransparent ||
              ['png', 'webp', 'svg', 'ico'].includes(normalizedTarget)
                ? 'checkerboard-premium'
                : 'bg-white'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={downloadUrl}
              alt="Pratinjau berkas hasil pemrosesan"
              className="max-h-56 max-w-full object-contain rounded"
            />
          </div>
        </div>
      )}

      {/* Telemetry & File Ledger */}
      <div className="rounded-2xl border border-slate-900/10 bg-[#f6f8fb] overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-slate-900/10 border-b border-slate-900/10 bg-white">
          <div className="p-3 sm:p-4">
            <span className="block text-[11px] text-[#4e5666]">
              Ukuran Sumber
            </span>
            <span className="mt-0.5 block font-mono text-xs sm:text-sm font-semibold text-[#0a0d14]">
              {initialBytes > 0 ? formatFileSize(initialBytes) : '-'}
            </span>
          </div>

          <div className="p-3 sm:p-4">
            <span className="block text-[11px] text-[#4e5666]">
              Ukuran Hasil
            </span>
            <span className="mt-0.5 block font-mono text-xs sm:text-sm font-semibold text-[#0a0d14]">
              {formatFileSize(finalBytes)}
            </span>
          </div>

          <div className="p-3 sm:p-4">
            <span className="block text-[11px] text-[#4e5666]">Efisiensi</span>
            {savingsPercent > 0 ? (
              <span className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs sm:text-sm font-bold text-[#1d4ed8]">
                <TrendingDown className="h-3.5 w-3.5" />
                <span>-{savingsPercent}%</span>
              </span>
            ) : isSameFormatJob && initialBytes > 0 ? (
              <span className="mt-0.5 block font-mono text-xs sm:text-sm font-semibold text-[#0a0d14]">
                0% (Optimal)
              </span>
            ) : (
              <span className="mt-0.5 block font-mono text-xs sm:text-sm font-semibold text-[#0a0d14]">
                .{job.targetFormat.toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <div className="divide-y divide-slate-900/10 px-4 text-xs">
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-[#4e5666]">Berkas keluaran</span>
            <span className="truncate font-mono text-[11px] font-medium text-[#0a0d14] max-w-[210px] sm:max-w-sm">
              {job.outputFilename ||
                `${job.originalFilename}.${job.targetFormat}`}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 py-3">
            <span className="inline-flex items-center gap-1.5 text-[#4e5666]">
              {isClientPrivacy ? (
                <ShieldCheck className="h-3.5 w-3.5 text-[#2563eb]" />
              ) : (
                <Clock className="h-3.5 w-3.5 text-[#2563eb]" />
              )}
              <span>Siklus penyimpanan</span>
            </span>
            <span className="font-medium text-[#0a0d14] text-right">
              {isClientPrivacy
                ? '100% Lokal di Perangkat (Zero-Upload)'
                : deleteSuccess
                ? 'Telah dimusnahkan permanen dari server'
                : 'Dihapus otomatis dalam 60 menit'}
            </span>
          </div>
        </div>
      </div>

      {deleteError && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50/90 p-3 text-xs text-red-900"
        >
          {deleteError}
        </div>
      )}

      {/* Primary & Recovery Actions */}
      <div className="flex flex-col gap-2.5 sm:flex-row">
        {!deleteSuccess ? (
          <a
            href={downloadUrl}
            download={job.outputFilename || `hasil.${job.targetFormat}`}
            className="btn-primary-dark flex-1 py-3 text-sm"
          >
            <Download className="h-4 w-4" />
            <span>Unduh Hasil ({formatFileSize(finalBytes)})</span>
          </a>
        ) : (
          <div className="btn-ghost-clean flex-1 py-3 text-sm opacity-60 cursor-not-allowed">
            <span>Berkas Telah Dihapus dari Server</span>
          </div>
        )}

        <button
          type="button"
          onClick={onReset}
          className="btn-secondary-light py-2.5 px-5 text-sm"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Proses Baru</span>
        </button>

        {!isClientPrivacy && !deleteSuccess && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            aria-label="Hapus berkas dari server sekarang"
            title="Musnahkan berkas dari server sekarang"
            className="btn-ghost-clean py-2.5 px-4 text-xs hover:border-red-300 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{isDeleting ? 'Menghapus...' : 'Hapus Server'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
