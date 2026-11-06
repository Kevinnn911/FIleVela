// File: src/components/PdfToolsPanel.tsx

'use client';

import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileArchive,
  FileText,
  Layers,
  Loader2,
  Plus,
  Scissors,
  Upload,
  X,
} from 'lucide-react';

export type PdfToolMode = 'merge' | 'split';

const MAX_MERGE_FILES = 60;
const MAX_SINGLE_PDF_BYTES = 50 * 1024 * 1024;
const MAX_BATCH_PDF_BYTES = 250 * 1024 * 1024;

interface PdfToolsPanelProps {
  onSuccess: (
    job: {
      id: string;
      downloadUrl: string;
      originalFilename: string;
      outputFilename: string;
      targetFormat: string;
      inputSizeBytes?: number;
      outputSizeBytes: number;
      metadata?: Record<string, unknown>;
    },
    ownerToken: string
  ) => void;
}

export function PdfToolsPanel({ onSuccess }: PdfToolsPanelProps) {
  const [activeMode, setActiveMode] = useState<PdfToolMode>('merge');

  // Merge State
  const [mergeFiles, setMergeFiles] = useState<File[]>([]);
  const [isMergeDragOver, setIsMergeDragOver] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const mergeFileInputRef = useRef<HTMLInputElement>(null);

  // Split State
  const [splitFile, setSplitFile] = useState<File | null>(null);
  const [splitPageCount, setSplitPageCount] = useState<number | null>(null);
  const [isSplitDragOver, setIsSplitDragOver] = useState(false);
  const [splitMode, setSplitMode] = useState<'all' | 'range'>('all');
  const [splitRange, setSplitRange] = useState('');
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);
  const splitFileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleAddMergeFiles = (filesList: FileList | File[] | null) => {
    if (!filesList) return;
    setMergeError(null);

    const accepted: File[] = [];
    const issues: string[] = [];

    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      if (!file) continue;
      const isPdf =
        file.name.toLowerCase().endsWith('.pdf') ||
        file.type === 'application/pdf';
      if (!isPdf) {
        issues.push(`${file.name} bukan PDF`);
        continue;
      }
      if (file.size === 0) {
        issues.push(`${file.name} berukuran 0 byte`);
        continue;
      }
      if (file.size > MAX_SINGLE_PDF_BYTES) {
        issues.push(`${file.name} melebihi 50 MB`);
        continue;
      }
      accepted.push(file);
    }

    if (accepted.length === 0) {
      setMergeError(
        issues.length > 0
          ? `Berkas ditolak: ${issues.slice(0, 3).join(', ')}.`
          : 'Harap pilih berkas dengan format PDF (.pdf) yang valid.'
      );
      return;
    }

    setMergeFiles((prev) => {
      const combined = [...prev, ...accepted];
      if (combined.length > MAX_MERGE_FILES) {
        setMergeError(
          `Maksimal ${MAX_MERGE_FILES} berkas PDF dalam satu penggabungan. Kelebihan berkas dipangkas.`
        );
        return combined.slice(0, MAX_MERGE_FILES);
      }
      const totalBytes = combined.reduce((acc, f) => acc + f.size, 0);
      if (totalBytes > MAX_BATCH_PDF_BYTES) {
        setMergeError(
          'Total ukuran gabungan melampaui batas maksimum 250 MB.'
        );
        return prev;
      }
      if (issues.length > 0) {
        setMergeError(
          `Sebagian berkas dilewati: ${issues.slice(0, 2).join(', ')}.`
        );
      }
      return combined;
    });
  };

  const handleMoveMergeFile = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= mergeFiles.length) return;

    setMergeFiles((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      const target = copy[targetIndex];
      if (!temp || !target) return prev;
      copy[index] = target;
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleRemoveMergeFile = (index: number) => {
    setMergeFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const totalMergeBytes = mergeFiles.reduce((acc, f) => acc + f.size, 0);

  const handleExecuteMerge = async () => {
    if (mergeFiles.length < 2) {
      setMergeError('Pilih minimal 2 berkas PDF untuk digabungkan.');
      return;
    }

    setIsMerging(true);
    setMergeError(null);

    try {
      const formData = new FormData();
      mergeFiles.forEach((f) => formData.append('files', f));

      const res = await fetch('/api/pdf/merge', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.message || data.error || 'Gagal menggabungkan berkas PDF.'
        );
      }

      onSuccess(
        {
          ...data.job,
          inputSizeBytes: totalMergeBytes,
        },
        data.ownerToken
      );
    } catch (err) {
      setMergeError(
        err instanceof Error ? err.message : 'Terjadi kesalahan sistem.'
      );
    } finally {
      setIsMerging(false);
    }
  };

  const handleSelectSplitFile = async (file: File) => {
    setSplitError(null);
    setSplitPageCount(null);

    if (
      !file.name.toLowerCase().endsWith('.pdf') &&
      file.type !== 'application/pdf'
    ) {
      setSplitError('Hanya berkas format PDF (.pdf) yang dapat dipisahkan.');
      return;
    }

    if (file.size === 0) {
      setSplitError('Berkas PDF berukuran 0 byte tidak dapat diproses.');
      return;
    }

    if (file.size > MAX_SINGLE_PDF_BYTES) {
      setSplitError('Ukuran berkas PDF melebihi batas maksimum 50 MB.');
      return;
    }

    setSplitFile(file);

    try {
      const { PDFDocument } = await import('pdf-lib');
      const arrayBuf = await file.arrayBuffer();
      const doc = await PDFDocument.load(arrayBuf, { ignoreEncryption: false });
      setSplitPageCount(doc.getPageCount());
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('encrypted')) {
        setSplitError(
          'Dokumen PDF ini terkunci kata sandi (terenkripsi). Buka kunci PDF terlebih dahulu sebelum memisahkan halaman.'
        );
        setSplitFile(null);
      }
    }
  };

  const handleExecuteSplit = async () => {
    if (!splitFile) {
      setSplitError('Harap pilih berkas PDF yang ingin dipisahkan.');
      return;
    }

    if (splitMode === 'range' && !splitRange.trim()) {
      setSplitError('Harap masukkan rentang halaman (contoh: 1-3, 5).');
      return;
    }

    setIsSplitting(true);
    setSplitError(null);

    try {
      const formData = new FormData();
      formData.append('file', splitFile);
      formData.append('mode', splitMode);
      if (splitMode === 'range') {
        formData.append('range', splitRange.trim());
      }

      const res = await fetch('/api/pdf/split', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.message || data.error || 'Gagal memisahkan halaman PDF.'
        );
      }

      onSuccess(
        {
          ...data.job,
          inputSizeBytes: splitFile.size,
        },
        data.ownerToken
      );
    } catch (err) {
      setSplitError(
        err instanceof Error ? err.message : 'Terjadi kesalahan sistem.'
      );
    } finally {
      setIsSplitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Segmented Capsule Tool Mode Switcher */}
      <div
        role="tablist"
        aria-label="Operasi dokumen PDF"
        className="inline-grid grid-cols-2 gap-1 rounded-full border border-slate-900/10 bg-[#f6f8fb] p-1 w-full sm:w-auto"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'merge'}
          onClick={() => {
            setActiveMode('merge');
            setMergeError(null);
          }}
          className={`flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs sm:text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
            activeMode === 'merge'
              ? 'bg-[#111315] text-white font-semibold shadow-sm'
              : 'text-[#4e5666] hover:text-[#0a0d14] font-medium'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Gabung PDF (Merge)</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'split'}
          onClick={() => {
            setActiveMode('split');
            setSplitError(null);
          }}
          className={`flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs sm:text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
            activeMode === 'split'
              ? 'bg-[#111315] text-white font-semibold shadow-sm'
              : 'text-[#4e5666] hover:text-[#0a0d14] font-medium'
          }`}
        >
          <Scissors className="h-3.5 w-3.5" />
          <span>Pisah PDF (Split)</span>
        </button>
      </div>

      {/* MERGE PDF VIEW */}
      {activeMode === 'merge' && (
        <div className="space-y-4">
          <input
            ref={mergeFileInputRef}
            type="file"
            multiple
            accept=".pdf,application/pdf"
            aria-label="Pilih berkas PDF untuk digabungkan"
            onChange={(e) => {
              handleAddMergeFiles(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />

          {mergeFiles.length === 0 ? (
            <div
              role="button"
              tabIndex={0}
              onDragOver={(e) => {
                e.preventDefault();
                if (!isMerging) setIsMergeDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsMergeDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsMergeDragOver(false);
                if (!isMerging && e.dataTransfer.files.length > 0) {
                  handleAddMergeFiles(e.dataTransfer.files);
                }
              }}
              onClick={() => mergeFileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  mergeFileInputRef.current?.click();
                }
              }}
              className={`group flex flex-col items-center justify-center rounded-[20px] border border-dashed py-8 sm:py-10 px-4 text-center cursor-pointer transition-colors min-h-[196px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                isMergeDragOver
                  ? 'border-[#2563eb] bg-[#f0f6ff]'
                  : 'border-slate-900/16 bg-[#f6f8fb] hover:border-slate-900/30 hover:bg-[#eef2f7]'
              }`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-900/10 bg-white text-[#0a0d14] shadow-sm">
                <Upload className="h-5 w-5" />
              </div>
              <p className="mt-4 text-sm sm:text-[15px] font-semibold text-[#0a0d14]">
                Seret 2+ berkas PDF ke sini, atau{' '}
                <span className="text-[#2563eb] underline underline-offset-4 decoration-[#2563eb]/45">
                  pilih dokumen
                </span>
              </p>
              <p className="mt-1.5 font-mono text-[11px] text-[#4e5666]">
                Mendukung hingga {MAX_MERGE_FILES} berkas PDF sekaligus (maks 50
                MB/berkas, 250 MB total)
              </p>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (!isMerging) setIsMergeDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsMergeDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsMergeDragOver(false);
                if (!isMerging && e.dataTransfer.files.length > 0) {
                  handleAddMergeFiles(e.dataTransfer.files);
                }
              }}
              className={`rounded-2xl border transition-colors overflow-hidden ${
                isMergeDragOver
                  ? 'border-[#2563eb] bg-[#f0f6ff]'
                  : 'border-slate-900/10 bg-[#f6f8fb]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900/10 bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-[#0a0d14]">
                    Urutan Dokumen ({mergeFiles.length} / {MAX_MERGE_FILES} PDF)
                  </span>
                  <span className="font-mono text-[11px] text-[#4e5666]">
                    Total {formatFileSize(totalMergeBytes)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => mergeFileInputRef.current?.click()}
                    disabled={isMerging || mergeFiles.length >= MAX_MERGE_FILES}
                    className="btn-ghost-clean min-h-[34px] px-3 py-1 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5 text-[#2563eb]" />
                    <span>Tambah PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMergeFiles([]);
                      setMergeError(null);
                    }}
                    disabled={isMerging}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-[#4e5666] hover:bg-slate-900/5 hover:text-[#0a0d14] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
                  >
                    Kosongkan
                  </button>
                </div>
              </div>

              <div
                data-slide-scrollable="true"
                className="divide-y divide-slate-900/8 max-h-[240px] overflow-y-auto"
              >
                {mergeFiles.map((file, idx) => (
                  <div
                    key={`${file.name}-${file.size}-${idx}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-900/10 bg-white font-mono text-[11px] font-semibold text-[#0a0d14]">
                        {idx + 1}
                      </span>
                      <FileText className="h-4 w-4 shrink-0 text-[#2563eb]" />
                      <div className="min-w-0">
                        <p className="truncate text-xs sm:text-[13px] font-medium text-[#0a0d14]">
                          {file.name}
                        </p>
                        <p className="font-mono text-[11px] text-[#4e5666]">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMoveMergeFile(idx, 'up')}
                        disabled={idx === 0 || isMerging}
                        aria-label={`Geser ${file.name} ke atas`}
                        title="Geser ke atas"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[#4e5666] hover:bg-slate-900/6 hover:text-[#0a0d14] disabled:opacity-30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveMergeFile(idx, 'down')}
                        disabled={idx === mergeFiles.length - 1 || isMerging}
                        aria-label={`Geser ${file.name} ke bawah`}
                        title="Geser ke bawah"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[#4e5666] hover:bg-slate-900/6 hover:text-[#0a0d14] disabled:opacity-30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveMergeFile(idx)}
                        disabled={isMerging}
                        aria-label={`Hapus ${file.name} dari daftar`}
                        title="Hapus dari daftar"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[#4e5666] hover:bg-slate-900/6 hover:text-[#0a0d14] disabled:opacity-30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mergeError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50/90 p-3.5 text-xs text-red-900"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span className="leading-relaxed font-medium">{mergeError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleExecuteMerge}
            disabled={isMerging || mergeFiles.length < 2}
            className="btn-primary-dark w-full py-3 text-sm"
          >
            {isMerging ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Menggabungkan {mergeFiles.length} dokumen PDF...</span>
              </>
            ) : (
              <>
                <Layers className="h-4 w-4" />
                <span>
                  {mergeFiles.length < 2
                    ? 'Pilih Minimal 2 Berkas PDF untuk Digabungkan'
                    : `Gabungkan ${mergeFiles.length} Berkas PDF Menjadi Satu`}
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* SPLIT PDF VIEW */}
      {activeMode === 'split' && (
        <div className="space-y-4">
          <input
            ref={splitFileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            aria-label="Pilih berkas PDF untuk dipisahkan"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                void handleSelectSplitFile(e.target.files[0]);
              }
              e.target.value = '';
            }}
            className="hidden"
          />

          {!splitFile ? (
            <div
              role="button"
              tabIndex={0}
              onDragOver={(e) => {
                e.preventDefault();
                if (!isSplitting) setIsSplitDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsSplitDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsSplitDragOver(false);
                const dropped = e.dataTransfer.files[0];
                if (!isSplitting && dropped) {
                  void handleSelectSplitFile(dropped);
                }
              }}
              onClick={() => splitFileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  splitFileInputRef.current?.click();
                }
              }}
              className={`group flex flex-col items-center justify-center rounded-[20px] border border-dashed py-8 sm:py-10 px-4 text-center cursor-pointer transition-colors min-h-[196px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                isSplitDragOver
                  ? 'border-[#2563eb] bg-[#f0f6ff]'
                  : 'border-slate-900/16 bg-[#f6f8fb] hover:border-slate-900/30 hover:bg-[#eef2f7]'
              }`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-900/10 bg-white text-[#0a0d14] shadow-sm">
                <Upload className="h-5 w-5" />
              </div>
              <p className="mt-4 text-sm sm:text-[15px] font-semibold text-[#0a0d14]">
                Seret berkas PDF yang ingin dipisahkan, atau{' '}
                <span className="text-[#2563eb] underline underline-offset-4 decoration-[#2563eb]/45">
                  pilih dokumen
                </span>
              </p>
              <p className="mt-1.5 font-mono text-[11px] text-[#4e5666]">
                1 berkas PDF tidak terenkripsi (Maksimal 50 MB)
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selected PDF Strip */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-900/10 bg-[#f6f8fb] p-3.5 sm:p-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-900/10 bg-white shadow-sm">
                    <FileText className="h-5 w-5 text-[#2563eb]" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#0a0d14]">
                      {splitFile.name}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-[#4e5666]">
                      {formatFileSize(splitFile.size)}
                      {splitPageCount !== null
                        ? ` / Total ${splitPageCount} halaman`
                        : ' / Dokumen PDF'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() => splitFileInputRef.current?.click()}
                    disabled={isSplitting}
                    className="btn-ghost-clean min-h-[36px] px-3.5 py-1.5 text-xs bg-white"
                  >
                    Ganti PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSplitFile(null);
                      setSplitPageCount(null);
                    }}
                    disabled={isSplitting}
                    aria-label="Batalkan pilihan PDF"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-900/10 bg-white text-[#4e5666] hover:border-slate-900/20 hover:text-[#0a0d14] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Split Strategy Selector */}
              <div className="border-t border-slate-900/8 pt-4 space-y-3">
                <span className="block text-[13px] font-semibold text-[#0a0d14]">
                  Metode pemisahan halaman
                </span>

                <div
                  role="radiogroup"
                  aria-label="Metode pemisahan halaman"
                  className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={splitMode === 'all'}
                    onClick={() => setSplitMode('all')}
                    className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                      splitMode === 'all'
                        ? 'border-[#111315] bg-[#111315] text-white shadow-sm'
                        : 'border-slate-900/10 bg-[#f6f8fb] text-[#0a0d14] hover:border-slate-900/20 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs sm:text-[13px] font-semibold">
                        Ekstrak Semua Halaman (.ZIP)
                      </span>
                      <FileArchive className="h-4 w-4 shrink-0 opacity-85" />
                    </div>
                    <span
                      className={`mt-1.5 text-xs leading-relaxed ${
                        splitMode === 'all'
                          ? 'text-white/80'
                          : 'text-[#4e5666]'
                      }`}
                    >
                      Setiap halaman dipisah menjadi berkas PDF mandiri di dalam
                      satu arsip ZIP.
                    </span>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={splitMode === 'range'}
                    onClick={() => setSplitMode('range')}
                    className={`flex flex-col justify-between rounded-2xl border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                      splitMode === 'range'
                        ? 'border-[#111315] bg-[#111315] text-white shadow-sm'
                        : 'border-slate-900/10 bg-[#f6f8fb] text-[#0a0d14] hover:border-slate-900/20 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs sm:text-[13px] font-semibold">
                        Rentang Halaman Tertentu
                      </span>
                      <Scissors className="h-4 w-4 shrink-0 opacity-85" />
                    </div>
                    <span
                      className={`mt-1.5 text-xs leading-relaxed ${
                        splitMode === 'range'
                          ? 'text-white/80'
                          : 'text-[#4e5666]'
                      }`}
                    >
                      Ambil nomor atau rentang halaman spesifik menjadi dokumen
                      PDF baru.
                    </span>
                  </button>
                </div>

                {splitMode === 'range' && (
                  <div className="pt-1 space-y-1.5">
                    <label
                      htmlFor="split-range-input"
                      className="block text-xs font-medium text-[#0a0d14]"
                    >
                      Nomor atau rentang halaman
                      {splitPageCount !== null
                        ? ` (tersedia halaman 1 s/d ${splitPageCount})`
                        : ' (pisahkan dengan koma)'}
                    </label>
                    <input
                      id="split-range-input"
                      type="text"
                      placeholder={
                        splitPageCount && splitPageCount >= 3
                          ? `Contoh: 1-2, ${splitPageCount}`
                          : 'Contoh: 1-3, 5, 8-10'
                      }
                      value={splitRange}
                      onChange={(e) => setSplitRange(e.target.value)}
                      className="h-11 w-full rounded-full border border-slate-900/14 bg-white px-4 font-mono text-xs text-[#0a0d14] placeholder:text-[#6c7586] focus:border-[#111315] focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {splitError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50/90 p-3.5 text-xs text-red-900"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span className="leading-relaxed font-medium">{splitError}</span>
            </div>
          )}

          {splitFile && (
            <button
              type="button"
              onClick={handleExecuteSplit}
              disabled={isSplitting}
              className="btn-primary-dark w-full py-3 text-sm"
            >
              {isSplitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Mengekstrak halaman PDF...</span>
                </>
              ) : (
                <>
                  <Scissors className="h-4 w-4" />
                  <span>Pisahkan Halaman PDF Sekarang</span>
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
