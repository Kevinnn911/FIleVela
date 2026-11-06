// File: src/components/FileUploadZone.tsx

'use client';

import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Film,
  Music,
  Upload,
  X,
} from 'lucide-react';

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void;
  onFilesSelect?: (files: File[]) => void;
  selectedFile: File | null;
  onClearFile: () => void;
  maxSizeBytes?: number;
  acceptedTypesLabel?: string;
  isProcessing?: boolean;
  multiple?: boolean;
}

export function FileUploadZone({
  onFileSelect,
  onFilesSelect,
  selectedFile,
  onClearFile,
  maxSizeBytes = 50 * 1024 * 1024,
  acceptedTypesLabel = 'Office, PDF, Gambar, Audio, Video, Data',
  isProcessing = false,
  multiple = true,
}: FileUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleValidateSingle = (file: File) => {
    setErrorMessage(null);

    if (file.size === 0) {
      setErrorMessage('Berkas berukuran 0 byte tidak dapat diproses.');
      return;
    }

    if (file.size > maxSizeBytes) {
      const maxMb = maxSizeBytes / (1024 * 1024);
      setErrorMessage(
        `Ukuran berkas (${formatFileSize(
          file.size
        )}) melebihi batas maksimum ${maxMb} MB.`
      );
      return;
    }

    onFileSelect(file);
  };

  const handleValidateBatch = (rawFiles: File[]) => {
    setErrorMessage(null);
    const maxMb = maxSizeBytes / (1024 * 1024);
    const valid: File[] = [];
    const rejected: string[] = [];

    for (const f of rawFiles) {
      if (f.size === 0) {
        rejected.push(`${f.name} (0 byte)`);
      } else if (f.size > maxSizeBytes) {
        rejected.push(`${f.name} (> ${maxMb} MB)`);
      } else {
        valid.push(f);
      }
    }

    if (valid.length === 0) {
      setErrorMessage(
        `Seluruh berkas ditolak: ${rejected.slice(0, 3).join(', ')}. Pastikan ukuran antara 1 B hingga ${maxMb} MB.`
      );
      return;
    }

    if (rejected.length > 0) {
      setErrorMessage(
        `${rejected.length} berkas dilewati karena ukuran tidak valid (${rejected
          .slice(0, 2)
          .join(', ')}).`
      );
    }

    if (valid.length === 1 && valid[0]) {
      onFileSelect(valid[0]);
      return;
    }

    if (onFilesSelect) {
      onFilesSelect(valid);
    } else if (valid[0]) {
      onFileSelect(valid[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isProcessing) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (isProcessing) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const list = Array.from(e.dataTransfer.files);
      if (multiple && list.length > 1) {
        handleValidateBatch(list);
      } else if (list[0]) {
        handleValidateSingle(list[0]);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const list = Array.from(e.target.files);
      if (multiple && list.length > 1) {
        handleValidateBatch(list);
      } else if (list[0]) {
        handleValidateSingle(list[0]);
      }
    }
    e.target.value = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isProcessing) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const getFileSpecificIcon = (filename: string) => {
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
      return <FileImage className="h-5 w-5 text-[#0a0d14]" />;
    }
    if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) {
      return <FileSpreadsheet className="h-5 w-5 text-[#0a0d14]" />;
    }
    if (
      ['docx', 'doc', 'odt', 'pptx', 'ppt', 'pdf', 'txt', 'md', 'rtf'].includes(
        ext
      )
    ) {
      return <FileText className="h-5 w-5 text-[#0a0d14]" />;
    }
    if (['json', 'xml', 'yaml', 'yml', 'html', 'htm'].includes(ext)) {
      return <FileCode2 className="h-5 w-5 text-[#0a0d14]" />;
    }
    if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
      return <Film className="h-5 w-5 text-[#0a0d14]" />;
    }
    if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) {
      return <Music className="h-5 w-5 text-[#0a0d14]" />;
    }
    if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) {
      return <FileArchive className="h-5 w-5 text-[#0a0d14]" />;
    }
    return <File className="h-5 w-5 text-[#0a0d14]" />;
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        multiple={multiple}
        onChange={handleInputChange}
        disabled={isProcessing}
        className="hidden"
        aria-label="Pilih berkas untuk diproses"
      />

      {!selectedFile ? (
        <div
          role="button"
          tabIndex={0}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          onKeyDown={handleKeyDown}
          className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-[18px] sm:rounded-[20px] border border-dashed py-6 sm:py-10 px-3.5 sm:px-6 text-center transition-colors duration-150 min-h-[168px] sm:min-h-[196px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
            isDragOver
              ? 'border-[#2563eb] bg-[#eff6ff]/70'
              : 'border-slate-900/15 bg-[#f8fafc] hover:border-slate-900/30 hover:bg-[#f3f6fb]'
          }`}
        >
          <div className="inline-flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl border border-slate-900/[0.08] bg-white text-[#0a0d14] shadow-soft">
            <Upload className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>

          <p className="mt-3 sm:mt-3.5 text-[13px] sm:text-[15px] font-medium text-[#0a0d14]">
            Seret berkas ke meja kerja, atau{' '}
            <span className="font-semibold text-[#2563eb] underline underline-offset-4 decoration-[#2563eb]/40 group-hover:decoration-[#2563eb]">
              telusuri perangkat
            </span>
          </p>

          <p className="mt-1 sm:mt-1.5 max-w-lg text-[11px] sm:text-xs text-[#5b6374] leading-relaxed">
            {acceptedTypesLabel}
          </p>

          <div className="mt-3 sm:mt-3.5 inline-flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 rounded-full border border-slate-900/[0.07] bg-white px-3 sm:px-3.5 py-1 text-[10.5px] sm:text-[11px] font-mono text-[#5b6374]">
            <span>Maks {maxSizeBytes / (1024 * 1024)} MB/berkas</span>
            {multiple && (
              <>
                <span
                  aria-hidden="true"
                  className="h-1 w-1 rounded-full bg-slate-400"
                />
                <span className="font-medium text-[#0a0d14]">
                  Multi-berkas & Arsip .ZIP aktif
                </span>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-900/[0.08] bg-[#f8fafc] p-3 sm:p-4">
          <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl border border-slate-900/[0.08] bg-white shadow-soft">
              {getFileSpecificIcon(selectedFile.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs sm:text-sm font-semibold text-[#0a0d14]">
                {selectedFile.name}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs text-[#5b6374]">
                <span className="font-mono text-[11px] text-[#0a0d14]">
                  {formatFileSize(selectedFile.size)}
                </span>
                <span
                  aria-hidden="true"
                  className="h-1 w-1 rounded-full bg-slate-400"
                />
                <span className="rounded-full border border-slate-900/[0.08] bg-white px-2 py-0.5 font-mono text-[11px] font-medium uppercase text-[#0a0d14]">
                  .{selectedFile.name.split('.').pop() || 'file'}
                </span>
                <span
                  aria-hidden="true"
                  className="h-1 w-1 rounded-full bg-slate-400"
                />
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Siap</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <button
              type="button"
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              disabled={isProcessing}
              className="btn-secondary-light min-h-[34px] sm:min-h-[36px] px-3 sm:px-3.5 py-1.5 text-xs"
            >
              Ganti Berkas
            </button>
            <button
              type="button"
              onClick={onClearFile}
              disabled={isProcessing}
              aria-label="Batalkan pilihan berkas"
              title="Batalkan pilihan berkas"
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border border-slate-900/[0.08] bg-white text-[#5b6374] hover:border-slate-900/20 hover:text-[#0a0d14] transition-colors duration-150 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
          <span className="leading-relaxed font-medium">{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
