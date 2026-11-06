// File: src/components/BatchQueuePanel.tsx

'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  File,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Film,
  FolderArchive,
  Loader2,
  Music,
  Play,
  ShieldCheck,
  Trash2,
  TrendingDown,
  X,
} from 'lucide-react';
import { ConversionTarget } from '@/lib/adapters/types';
import { BgMode } from '@/lib/bg-removal/types';
import type { CompressionLevel } from '@/lib/compression/file-compressor';
import {
  canCompressClientSide,
  canProcessClientSide,
  compressClientSide,
  processDataClientSide,
  processImageClientSide,
} from '@/lib/client/privacy-processor';
import { buildClientZipBlob, ClientZipEntry } from '@/lib/client/client-zip';

export type BatchOperationMode = 'convert' | 'compress' | 'bg-remove';

export interface BatchItem {
  id: string;
  file: File;
  targetFormat: string;
  availableTargets: ConversionTarget[];
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  downloadUrl?: string;
  localBlob?: Blob;
  outputFilename?: string;
  outputSizeBytes?: number;
  isLocalOnly?: boolean;
  jobId?: string;
  ownerToken?: string;
  deletedFromServer?: boolean;
  error?: string;
}

interface BatchQueuePanelProps {
  files: File[];
  mode?: BatchOperationMode;
  onClearQueue: () => void;
  onRemoveItem: (index: number) => void;
  privacyMode?: boolean;
}

const SUPPORTED_BG_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'avif',
  'tiff',
  'bmp',
  'svg',
  'gif',
  'ico',
]);

const SUPPORTED_COMPRESS_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'avif',
  'tiff',
  'gif',
  'bmp',
  'svg',
  'pdf',
  'docx',
  'pptx',
  'xlsx',
  'odt',
  'json',
  'xml',
  'html',
  'htm',
  'css',
  'csv',
  'tsv',
  'txt',
  'md',
  'yaml',
  'yml',
  'mp4',
  'webm',
  'mp3',
  'wav',
  'ogg',
  'flac',
  'm4a',
  'aac',
]);

const GLOBAL_CONVERT_OPTIONS = [
  'pdf',
  'png',
  'jpg',
  'webp',
  'avif',
  'docx',
  'xlsx',
  'json',
  'csv',
  'txt',
  'md',
  'html',
  'mp3',
  'mp4',
];

export function BatchQueuePanel({
  files,
  mode = 'convert',
  onClearQueue,
  onRemoveItem,
  privacyMode = false,
}: BatchQueuePanelProps) {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isPurgingAll, setIsPurgingAll] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Batch Compress Settings
  const [compressionLevel, setCompressionLevel] =
    useState<CompressionLevel>('recommended');

  // Batch BG-Removal Settings
  const [bgPreset, setBgPreset] = useState<
    'transparent' | 'ktp' | 'passport' | 'white'
  >('transparent');
  const [bgTolerance, setBgTolerance] = useState<number>(38);

  const createdBlobUrlsRef = useRef<Set<string>>(new Set());
  const itemsRef = useRef<BatchItem[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    const trackedUrls = createdBlobUrlsRef.current;
    return () => {
      trackedUrls.forEach((url) => URL.revokeObjectURL(url));
      trackedUrls.clear();
    };
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (
      [
        'jpg',
        'jpeg',
        'png',
        'webp',
        'avif',
        'svg',
        'gif',
        'bmp',
        'tiff',
        'ico',
      ].includes(ext)
    ) {
      return <FileImage className="h-4 w-4 text-[#2563eb]" />;
    }
    if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) {
      return <FileSpreadsheet className="h-4 w-4 text-[#2563eb]" />;
    }
    if (
      ['docx', 'doc', 'odt', 'pptx', 'ppt', 'pdf', 'txt', 'md', 'rtf'].includes(
        ext
      )
    ) {
      return <FileText className="h-4 w-4 text-[#0a0d14]" />;
    }
    if (['json', 'xml', 'yaml', 'yml', 'html', 'htm'].includes(ext)) {
      return <FileCode2 className="h-4 w-4 text-[#1d4ed8]" />;
    }
    if (['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) {
      return <Film className="h-4 w-4 text-[#2563eb]" />;
    }
    if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext)) {
      return <Music className="h-4 w-4 text-[#2563eb]" />;
    }
    return <File className="h-4 w-4 text-[#0a0d14]" />;
  };

  useEffect(() => {
    let isMounted = true;

    async function syncQueueItems() {
      const extCache: Record<string, ConversionTarget[]> = {};
      const previousByFile = new Map<File, BatchItem>();
      for (const prevItem of itemsRef.current) {
        previousByFile.set(prevItem.file, prevItem);
      }

      const nextItems: BatchItem[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;

        const existing = previousByFile.get(file);
        if (existing) {
          nextItems.push(existing);
          continue;
        }

        const ext = file.name.split('.').pop()?.toLowerCase() || 'unknown';

        if (mode === 'compress') {
          const supported = SUPPORTED_COMPRESS_EXTENSIONS.has(ext);
          nextItems.push({
            id: `${file.name}-${file.size}-${i}-${Date.now()}`,
            file,
            targetFormat: ext,
            availableTargets: [],
            status: supported ? 'pending' : 'failed',
            error: supported
              ? undefined
              : `Format .${ext} tidak mendukung kompresi langsung.`,
          });
          continue;
        }

        if (mode === 'bg-remove') {
          const supported = SUPPORTED_BG_EXTENSIONS.has(ext);
          nextItems.push({
            id: `${file.name}-${file.size}-${i}-${Date.now()}`,
            file,
            targetFormat: 'png',
            availableTargets: [],
            status: supported ? 'pending' : 'failed',
            error: supported
              ? undefined
              : `Format .${ext} bukan citra yang didukung untuk isolasi latar.`,
          });
          continue;
        }

        let targets: ConversionTarget[] = extCache[ext] || [];
        if (!extCache[ext]) {
          try {
            const res = await fetch(
              `/api/capabilities?source=${encodeURIComponent(ext)}`
            );
            if (res.ok) {
              const data = await res.json();
              targets = data.targets || [];
              extCache[ext] = targets;
            }
          } catch {
            targets = [];
          }
        }

        const defaultTarget =
          targets.length > 0 && targets[0] ? targets[0].targetFormat : '';
        nextItems.push({
          id: `${file.name}-${file.size}-${i}-${Date.now()}`,
          file,
          targetFormat: defaultTarget,
          availableTargets: targets,
          status: targets.length > 0 ? 'pending' : 'failed',
          error:
            targets.length > 0
              ? undefined
              : `Format .${ext} belum memiliki adapter konversi aktif.`,
        });
      }

      if (isMounted) {
        setItems(nextItems);
      }
    }

    void syncQueueItems();

    return () => {
      isMounted = false;
    };
  }, [files, mode]);

  const handleTargetChange = (index: number, newTarget: string) => {
    setItems((prev) => {
      const current = prev[index];
      if (!current) return prev;
      const next = [...prev];
      next[index] = {
        ...current,
        targetFormat: newTarget,
        status: current.status === 'failed' ? 'pending' : current.status,
        error: undefined,
      };
      return next;
    });
  };

  const handleApplyGlobalTarget = (target: string) => {
    setItems((prev) =>
      prev.map((item) => {
        const hasTarget = item.availableTargets.some(
          (t) => t.targetFormat === target
        );
        return hasTarget && item.status !== 'succeeded'
          ? {
              ...item,
              targetFormat: target,
              status: item.status === 'failed' ? 'pending' : item.status,
              error: undefined,
            }
          : item;
      })
    );
  };

  const processSingleItem = async (itemId: string): Promise<void> => {
    const currentSnapshot = itemsRef.current.find((i) => i.id === itemId);
    if (!currentSnapshot || currentSnapshot.status === 'succeeded') return;

    const srcExt =
      currentSnapshot.file.name.split('.').pop()?.toLowerCase() || '';

    if (mode === 'convert' && !currentSnapshot.targetFormat) {
      return;
    }
    if (mode === 'compress' && !SUPPORTED_COMPRESS_EXTENSIONS.has(srcExt)) {
      return;
    }
    if (mode === 'bg-remove' && !SUPPORTED_BG_EXTENSIONS.has(srcExt)) {
      return;
    }

    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, status: 'processing', error: undefined } : i
      )
    );

    // 1. Privacy Mode Local Execution
    if (privacyMode) {
      if (mode === 'bg-remove') {
        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId
              ? {
                  ...i,
                  status: 'failed',
                  error:
                    'Hapus BG membutuhkan engine server terisolasi (nonaktifkan Mode Privasi).',
                }
              : i
          )
        );
        return;
      }

      if (mode === 'compress') {
        if (!canCompressClientSide(srcExt)) {
          setItems((prev) =>
            prev.map((i) =>
              i.id === itemId
                ? {
                    ...i,
                    status: 'failed',
                    error: `Kompresi .${srcExt.toUpperCase()} membutuhkan engine server (nonaktifkan Mode Privasi).`,
                  }
                : i
            )
          );
          return;
        }

        try {
          const clientRes = await compressClientSide(
            currentSnapshot.file,
            compressionLevel
          );
          const localUrl = URL.createObjectURL(clientRes.blob);
          createdBlobUrlsRef.current.add(localUrl);
          setItems((prev) =>
            prev.map((i) =>
              i.id === itemId
                ? {
                    ...i,
                    status: 'succeeded',
                    isLocalOnly: true,
                    localBlob: clientRes.blob,
                    outputFilename: clientRes.filename,
                    outputSizeBytes: clientRes.sizeBytes,
                    downloadUrl: localUrl,
                  }
                : i
            )
          );
        } catch (err) {
          setItems((prev) =>
            prev.map((i) =>
              i.id === itemId
                ? {
                    ...i,
                    status: 'failed',
                    error:
                      err instanceof Error
                        ? err.message
                        : 'Gagal mengompresi berkas di browser.',
                  }
                : i
            )
          );
        }
        return;
      }

      // mode === 'convert' in Privacy Mode
      if (!canProcessClientSide(srcExt, currentSnapshot.targetFormat)) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId
              ? {
                  ...i,
                  status: 'failed',
                  error: `Konversi .${srcExt.toUpperCase()} ke .${currentSnapshot.targetFormat.toUpperCase()} membutuhkan engine server.`,
                }
              : i
          )
        );
        return;
      }

      try {
        const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(srcExt);
        const clientResult = isImage
          ? await processImageClientSide(
              currentSnapshot.file,
              currentSnapshot.targetFormat
            )
          : await processDataClientSide(
              currentSnapshot.file,
              currentSnapshot.targetFormat
            );
        const localUrl = URL.createObjectURL(clientResult.blob);
        createdBlobUrlsRef.current.add(localUrl);

        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId
              ? {
                  ...i,
                  status: 'succeeded',
                  isLocalOnly: true,
                  localBlob: clientResult.blob,
                  outputFilename: clientResult.filename,
                  outputSizeBytes: clientResult.sizeBytes,
                  downloadUrl: localUrl,
                }
              : i
          )
        );
      } catch (err) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId
              ? {
                  ...i,
                  status: 'failed',
                  error:
                    err instanceof Error
                      ? err.message
                      : 'Gagal memproses berkas secara lokal.',
                }
              : i
          )
        );
      }
      return;
    }

    // 2. Isolated Ephemeral Server Execution
    try {
      const formData = new FormData();
      formData.append('file', currentSnapshot.file);

      let endpoint = '/api/jobs';
      if (mode === 'convert') {
        formData.append('targetFormat', currentSnapshot.targetFormat);
      } else if (mode === 'compress') {
        endpoint = '/api/compress';
        formData.append('level', compressionLevel);
      } else {
        endpoint = '/api/background-removal';
        const resolvedMode: BgMode =
          bgPreset === 'transparent' ? 'transparent' : 'solid';
        formData.append('mode', resolvedMode);
        formData.append('tolerance', bgTolerance.toString());
        if (bgPreset === 'ktp') {
          formData.append('replacementColor', '#dc2626');
        } else if (bgPreset === 'passport') {
          formData.append('replacementColor', '#1e40af');
        } else if (bgPreset === 'white') {
          formData.append('replacementColor', '#ffffff');
        }
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.message || data.error || 'Gagal memproses berkas.'
        );
      }

      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? {
                ...i,
                status: 'succeeded',
                isLocalOnly: false,
                jobId: data.job.id,
                ownerToken: data.ownerToken,
                outputFilename: data.job.outputFilename,
                outputSizeBytes: data.job.outputSizeBytes,
                downloadUrl:
                  data.downloadUrl ||
                  data.job?.downloadUrl ||
                  `/api/jobs/${data.job.id}/download?token=${encodeURIComponent(
                    data.ownerToken
                  )}`,
              }
            : i
        )
      );
    } catch (err) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? {
                ...i,
                status: 'failed',
                error:
                  err instanceof Error ? err.message : 'Kesalahan jaringan.',
              }
            : i
        )
      );
    }
  };

  const handleProcessAll = async () => {
    setIsProcessingAll(true);
    setBatchError(null);

    const concurrency = 3;
    const queue = itemsRef.current
      .filter((item) => item.status !== 'succeeded')
      .map((item) => item.id);

    const runWorker = async () => {
      while (queue.length > 0) {
        const nextId = queue.shift();
        if (nextId) {
          await processSingleItem(nextId);
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, Math.max(1, queue.length)) },
      () => runWorker()
    );

    await Promise.all(workers);
    setIsProcessingAll(false);
  };

  const handleDownloadAllZip = async () => {
    const activeSucceeded = items.filter(
      (item) => item.status === 'succeeded' && !item.deletedFromServer
    );

    if (activeSucceeded.length === 0) {
      setBatchError('Tidak ada berkas yang selesai diproses untuk diunduh.');
      return;
    }

    setIsZipping(true);
    setBatchError(null);

    const allServerJobs = activeSucceeded.every(
      (item) => !item.isLocalOnly && Boolean(item.jobId && item.ownerToken)
    );

    try {
      if (allServerJobs) {
        const res = await fetch('/api/jobs/batch-zip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: activeSucceeded.map((item) => ({
              jobId: item.jobId,
              token: item.ownerToken,
            })),
            zipFilename: `fileflow_${mode}_${Date.now()}.zip`,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data.message || data.error || 'Gagal membuat arsip ZIP.'
          );
        }

        const a = document.createElement('a');
        a.href = data.downloadUrl;
        a.download = data.job?.outputFilename || `fileflow_${mode}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      // Client-side ZIP assembly (Privacy Mode or mixed local/server blobs)
      const zipEntries: ClientZipEntry[] = [];
      for (const item of activeSucceeded) {
        let blob: Blob | undefined = item.localBlob;
        if (!blob && item.downloadUrl) {
          const resp = await fetch(item.downloadUrl);
          if (resp.ok) {
            blob = await resp.blob();
          }
        }
        if (blob) {
          const buf = new Uint8Array(await blob.arrayBuffer());
          zipEntries.push({
            filename:
              item.outputFilename ||
              `${item.file.name}.${item.targetFormat || 'bin'}`,
            data: buf,
          });
        }
      }

      if (zipEntries.length === 0) {
        throw new Error('Tidak ada data berkas lokal untuk dibundel ke ZIP.');
      }

      const zipBlob = buildClientZipBlob(zipEntries);
      const zipUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = zipUrl;
      a.download = `fileflow_local_${mode}_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(zipUrl);
    } catch (err) {
      setBatchError(
        err instanceof Error ? err.message : 'Gagal mengunduh arsip ZIP.'
      );
    } finally {
      setIsZipping(false);
    }
  };

  const handlePurgeServerItems = async () => {
    const serverItems = items.filter(
      (i) =>
        i.status === 'succeeded' &&
        !i.isLocalOnly &&
        !i.deletedFromServer &&
        i.jobId &&
        i.ownerToken
    );
    if (serverItems.length === 0 || isPurgingAll) return;

    setIsPurgingAll(true);
    setBatchError(null);
    try {
      await Promise.all(
        serverItems.map(async (item) => {
          await fetch(`/api/jobs/${item.jobId}`, {
            method: 'DELETE',
            headers: { 'X-Session-Token': item.ownerToken! },
          });
        })
      );
      setItems((prev) =>
        prev.map((i) =>
          !i.isLocalOnly && i.status === 'succeeded'
            ? { ...i, deletedFromServer: true }
            : i
        )
      );
    } catch {
      setBatchError('Sebagian berkas gagal dihapus dari server.');
    } finally {
      setIsPurgingAll(false);
    }
  };

  const succeededItems = items.filter((i) => i.status === 'succeeded');
  const succeededCount = succeededItems.length;
  const activeServerSucceededCount = succeededItems.filter(
    (i) => !i.isLocalOnly && !i.deletedFromServer
  ).length;
  const isAllFinished = items.length > 0 && succeededCount === items.length;

  const totalInputSucceeded = succeededItems.reduce(
    (acc, i) => acc + i.file.size,
    0
  );
  const totalOutputSucceeded = succeededItems.reduce(
    (acc, i) => acc + (i.outputSizeBytes ?? i.file.size),
    0
  );
  const batchSavedPercent =
    mode === 'compress' &&
    totalInputSucceeded > 0 &&
    totalOutputSucceeded < totalInputSucceeded
      ? Math.round(
          ((totalInputSucceeded - totalOutputSucceeded) / totalInputSucceeded) *
            100
        )
      : 0;

  const modeActionLabel =
    mode === 'compress'
      ? `Kompres Semua (${items.length} Berkas)`
      : mode === 'bg-remove'
      ? `Hapus BG Semua (${items.length} Gambar)`
      : `Konversi Semua (${items.length} Berkas)`;

  return (
    <div className="space-y-4">
      {/* Batch Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-900/8 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[#0a0d14]">
              Antrian Batch ({items.length} Berkas)
            </h3>
            {privacyMode && (
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-[#f0f6ff] px-2.5 py-0.5 text-[11px] font-semibold text-[#1e40af]">
                <ShieldCheck className="h-3 w-3 text-[#2563eb]" />
                <span>Eksekusi Lokal</span>
              </span>
            )}
            {batchSavedPercent > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-[#f0f6ff] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#1d4ed8]">
                <TrendingDown className="h-3 w-3" />
                <span>Hemat -{batchSavedPercent}%</span>
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[#4e5666]">
            {succeededCount} dari {items.length} berkas selesai diproses
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mode === 'convert' && items.length > 1 && (
            <div className="flex items-center gap-1.5 text-xs">
              <label
                htmlFor="batch-global-target"
                className="text-[#4e5666] font-medium"
              >
                Seragamkan ke:
              </label>
              <select
                id="batch-global-target"
                onChange={(e) =>
                  e.target.value && handleApplyGlobalTarget(e.target.value)
                }
                defaultValue=""
                disabled={isProcessingAll}
                className="h-9 rounded-full border border-slate-900/12 bg-white px-3 text-xs font-semibold text-[#0a0d14] focus:border-[#111315] focus:outline-none"
              >
                <option value="" disabled>
                  Pilih format
                </option>
                {GLOBAL_CONVERT_OPTIONS.map((fmt) => (
                  <option key={fmt} value={fmt}>
                    .{fmt.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === 'compress' && (
            <div className="inline-flex items-center gap-1 rounded-full border border-slate-900/10 bg-[#f6f8fb] p-1">
              {(
                [
                  { id: 'low', label: 'Ringan' },
                  { id: 'recommended', label: 'Seimbang' },
                  { id: 'extreme', label: 'Maksimal' },
                ] as const
              ).map((lv) => (
                <button
                  key={lv.id}
                  type="button"
                  disabled={isProcessingAll}
                  onClick={() => setCompressionLevel(lv.id)}
                  className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                    compressionLevel === lv.id
                      ? 'bg-[#111315] text-white font-semibold shadow-sm'
                      : 'text-[#4e5666] hover:text-[#0a0d14]'
                  }`}
                >
                  {lv.label}
                </button>
              ))}
            </div>
          )}

          {mode === 'bg-remove' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-full border border-slate-900/10 bg-[#f6f8fb] p-1">
                {(
                  [
                    { id: 'transparent', label: 'Transparan' },
                    { id: 'ktp', label: 'Merah KTP' },
                    { id: 'passport', label: 'Biru Paspor' },
                    { id: 'white', label: 'Putih' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={isProcessingAll}
                    onClick={() => setBgPreset(preset.id)}
                    className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                      bgPreset === preset.id
                        ? 'bg-[#111315] text-white font-semibold shadow-sm'
                        : 'text-[#4e5666] hover:text-[#0a0d14]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <select
                aria-label="Sensitivitas tepi batch"
                value={bgTolerance}
                onChange={(e) => setBgTolerance(Number(e.target.value))}
                disabled={isProcessingAll}
                className="h-8 rounded-full border border-slate-900/12 bg-white px-2.5 font-mono text-[11px] text-[#0a0d14] focus:border-[#111315] focus:outline-none"
              >
                <option value={22}>Tol 22 (Ketat)</option>
                <option value={38}>Tol 38 (Standar)</option>
                <option value={58}>Tol 58 (Luas)</option>
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={onClearQueue}
            disabled={isProcessingAll}
            className="btn-ghost-clean min-h-[34px] px-3.5 py-1 text-xs"
          >
            Bersihkan
          </button>
        </div>
      </div>

      {/* Tabular Queue Ledger */}
      <div
        data-slide-scrollable="true"
        className="divide-y divide-slate-900/8 rounded-2xl border border-slate-900/10 bg-[#f6f8fb] max-h-[300px] overflow-y-auto"
      >
        {items.map((item, idx) => {
          const itemSavings =
            item.outputSizeBytes && item.outputSizeBytes < item.file.size
              ? Math.round(
                  ((item.file.size - item.outputSizeBytes) / item.file.size) *
                    100
                )
              : 0;

          return (
            <div key={item.id} className="p-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-900/10 bg-white shadow-sm">
                    {getFileIcon(item.file.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs sm:text-[13px] font-semibold text-[#0a0d14]">
                      {item.file.name}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#4e5666]">
                      <span>{formatFileSize(item.file.size)}</span>
                      {item.status === 'succeeded' &&
                        item.outputSizeBytes !== undefined && (
                          <>
                            <span>-&gt;</span>
                            <span className="text-[#0a0d14] font-medium">
                              {formatFileSize(item.outputSizeBytes)}
                            </span>
                            {itemSavings > 0 && (
                              <span className="text-[#1d4ed8] font-semibold">
                                (-{itemSavings}%)
                              </span>
                            )}
                          </>
                        )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {(item.status === 'pending' || item.status === 'failed') && (
                    <>
                      {mode === 'convert' && item.availableTargets.length > 0 && (
                        <select
                          aria-label={`Pilih format target untuk ${item.file.name}`}
                          value={item.targetFormat}
                          onChange={(e) =>
                            handleTargetChange(idx, e.target.value)
                          }
                          disabled={isProcessingAll}
                          className="h-9 rounded-full border border-slate-900/12 bg-white px-3 font-mono text-xs font-semibold text-[#0a0d14] focus:border-[#111315] focus:outline-none"
                        >
                          {item.availableTargets.map((t) => (
                            <option key={t.targetFormat} value={t.targetFormat}>
                              .{t.targetFormat.toUpperCase()} ({t.label})
                            </option>
                          ))}
                        </select>
                      )}

                      {(mode !== 'convert' ||
                        item.availableTargets.length > 0) && (
                        <button
                          type="button"
                          onClick={() => void processSingleItem(item.id)}
                          disabled={isProcessingAll}
                          className="rounded-full bg-[#111315] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#22262b] transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
                        >
                          {item.status === 'failed' ? 'Ulangi' : 'Proses'}
                        </button>
                      )}
                    </>
                  )}

                  {item.status === 'processing' && (
                    <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-900/10 bg-white px-3.5 text-xs font-medium text-[#0a0d14]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2563eb]" />
                      <span>Memproses...</span>
                    </span>
                  )}

                  {item.status === 'succeeded' && item.downloadUrl && (
                    <div className="flex items-center gap-2">
                      {item.deletedFromServer ? (
                        <span className="text-[11px] font-mono text-[#4e5666]">
                          Dihapus dari server
                        </span>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#1d4ed8]">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Selesai</span>
                          </span>
                          <a
                            href={item.downloadUrl}
                            download={
                              item.outputFilename ||
                              `hasil.${item.targetFormat || 'bin'}`
                            }
                            className="btn-ghost-clean min-h-[34px] px-3 py-1 text-xs bg-white"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Unduh</span>
                          </a>
                        </>
                      )}
                    </div>
                  )}

                  {item.status !== 'processing' && !isProcessingAll && (
                    <button
                      type="button"
                      onClick={() => onRemoveItem(idx)}
                      aria-label={`Hapus ${item.file.name} dari antrian`}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-[#4e5666] hover:bg-slate-900/6 hover:text-[#0a0d14] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {item.status === 'failed' && item.error && (
                <div className="mt-2 flex items-start gap-1.5 rounded-xl border border-red-200 bg-red-50/90 px-3 py-2 text-[11px] text-red-900">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600 mt-0.5" />
                  <span>{item.error}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {batchError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50/90 p-3.5 text-xs text-red-900"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
          <span className="leading-relaxed font-medium">{batchError}</span>
        </div>
      )}

      {/* Batch Execution Actions */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 pt-1">
        <button
          type="button"
          onClick={handleProcessAll}
          disabled={isProcessingAll || isAllFinished}
          className="btn-primary-dark flex-1 py-3 text-sm"
        >
          {isProcessingAll ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Memproses seluruh antrian...</span>
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              <span>
                {isAllFinished
                  ? 'Seluruh Antrian Selesai Diproses'
                  : modeActionLabel}
              </span>
            </>
          )}
        </button>

        {succeededCount > 0 && (
          <button
            type="button"
            onClick={handleDownloadAllZip}
            disabled={isZipping}
            className="btn-secondary-light px-5 py-2.5 text-sm"
          >
            {isZipping ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Membuat ZIP...</span>
              </>
            ) : (
              <>
                <FolderArchive className="h-4 w-4 text-[#2563eb]" />
                <span>Unduh Semua (.ZIP)</span>
              </>
            )}
          </button>
        )}

        {activeServerSucceededCount > 0 && (
          <button
            type="button"
            onClick={handlePurgeServerItems}
            disabled={isPurgingAll}
            className="btn-ghost-clean px-4 py-2.5 text-xs hover:border-red-300 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>
              {isPurgingAll ? 'Menghapus...' : 'Hapus Semua dari Server'}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
