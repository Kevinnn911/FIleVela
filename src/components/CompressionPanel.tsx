// File: src/components/CompressionPanel.tsx

'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Loader2,
  Minimize2,
  ShieldCheck,
  TrendingDown,
} from 'lucide-react';
import type { CompressionLevel } from '@/lib/compression/file-compressor';
import { canCompressClientSide } from '@/lib/client/privacy-processor';

interface CompressionPanelProps {
  selectedFile: File;
  onCompress: (level: CompressionLevel) => Promise<void>;
  isCompressing: boolean;
  privacyMode?: boolean;
}

const SERVER_SUPPORTED_FORMATS = new Set([
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

interface LevelOption {
  id: CompressionLevel;
  title: string;
  tag: string;
  description: string;
  ratioMultiplier: number;
  reductionRange: string;
  meterPercent: number;
}

function getFormatAwareLevels(ext: string): LevelOption[] {
  const isMedia = [
    'mp4',
    'webm',
    'mp3',
    'wav',
    'ogg',
    'flac',
    'm4a',
    'aac',
  ].includes(ext);
  const isDocOrZip = ['pdf', 'docx', 'pptx', 'xlsx', 'odt'].includes(ext);
  const isTextData = [
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
    'svg',
  ].includes(ext);

  if (isMedia) {
    return [
      {
        id: 'low',
        title: 'Ringan',
        tag: 'Kualitas Siar',
        description:
          'Transcoding CRF/bitrate konservatif agar kejernihan gambar dan frekuensi audio tetap prima.',
        ratioMultiplier: 0.78,
        reductionRange: '-15% s/d -30%',
        meterPercent: 28,
      },
      {
        id: 'recommended',
        title: 'Seimbang',
        tag: 'Direkomendasikan',
        description:
          'Optimasi codec FFmpeg H.264/VP9 & audio terukur untuk penghematan kuota distribusi.',
        ratioMultiplier: 0.56,
        reductionRange: '-35% s/d -55%',
        meterPercent: 54,
      },
      {
        id: 'extreme',
        title: 'Maksimal',
        tag: 'Ukuran Minimum',
        description:
          'Bitrate ketat & penyesuaian resolusi efisien untuk lampiran pesan instan.',
        ratioMultiplier: 0.36,
        reductionRange: '-55% s/d -70%',
        meterPercent: 78,
      },
    ];
  }

  if (isDocOrZip) {
    return [
      {
        id: 'low',
        title: 'Ringan',
        tag: 'Struktur Murni',
        description:
          'Pemadatan object stream PDF & arsip Deflate tanpa menurunkan resolusi aset gambar.',
        ratioMultiplier: 0.84,
        reductionRange: '-10% s/d -25%',
        meterPercent: 24,
      },
      {
        id: 'recommended',
        title: 'Seimbang',
        tag: 'Direkomendasikan',
        description:
          'Optimasi aset media tertanam beserta pembersihan metadata dokumen berlebih.',
        ratioMultiplier: 0.62,
        reductionRange: '-25% s/d -50%',
        meterPercent: 50,
      },
      {
        id: 'extreme',
        title: 'Maksimal',
        tag: 'Kuota Portal',
        description:
          'Rekompresi intensif citra di dalam dokumen untuk portal administrasi berbatas ketat.',
        ratioMultiplier: 0.42,
        reductionRange: '-45% s/d -70%',
        meterPercent: 74,
      },
    ];
  }

  if (isTextData) {
    return [
      {
        id: 'low',
        title: 'Ringan',
        tag: 'Rapi & Aman',
        description:
          'Menghapus spasi ekor baris dan komentar tanpa menyentuh blok kode penting.',
        ratioMultiplier: 0.88,
        reductionRange: '-8% s/d -20%',
        meterPercent: 22,
      },
      {
        id: 'recommended',
        title: 'Seimbang',
        tag: 'Direkomendasikan',
        description:
          'Minifikasi struktur markup/data sambil menjaga integritas skema dan blok <pre>.',
        ratioMultiplier: 0.72,
        reductionRange: '-20% s/d -40%',
        meterPercent: 44,
      },
      {
        id: 'extreme',
        title: 'Maksimal',
        tag: 'Payload Padat',
        description:
          'Pemangkasan whitespace maksimum untuk transmisi jaringan berkecepatan tinggi.',
        ratioMultiplier: 0.64,
        reductionRange: '-25% s/d -45%',
        meterPercent: 58,
      },
    ];
  }

  return [
    {
      id: 'low',
      title: 'Ringan',
      tag: 'Fidelitas Tinggi',
      description:
        'Menghapus metadata EXIF berlebih dengan tetap menjaga ketajaman piksel asli.',
      ratioMultiplier: 0.74,
      reductionRange: '-20% s/d -35%',
      meterPercent: 30,
    },
    {
      id: 'recommended',
      title: 'Seimbang',
      tag: 'Direkomendasikan',
      description:
        'Rasio optimal antara pengurangan bobot berkas dan kejernihan visual.',
      ratioMultiplier: 0.48,
      reductionRange: '-40% s/d -60%',
      meterPercent: 56,
    },
    {
      id: 'extreme',
      title: 'Maksimal',
      tag: 'Ukuran Minimum',
      description:
        'Kuantisasi palet/chroma agresif untuk portal unggahan berkuota ketat.',
      ratioMultiplier: 0.26,
      reductionRange: '-65% s/d -82%',
      meterPercent: 82,
    },
  ];
}

export function CompressionPanel({
  selectedFile,
  onCompress,
  isCompressing,
  privacyMode = false,
}: CompressionPanelProps) {
  const [selectedLevel, setSelectedLevel] =
    useState<CompressionLevel>('recommended');

  const fileExt = selectedFile.name.split('.').pop()?.toLowerCase() || '';
  const isSupportedServer = SERVER_SUPPORTED_FORMATS.has(fileExt);
  const isSupportedPrivacy = canCompressClientSide(fileExt);

  const levels = useMemo(() => getFormatAwareLevels(fileExt), [fileExt]);

  const formatFileSize = (bytes: number): string => {
    if (bytes <= 0) return '0 B';
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  if (!isSupportedServer) {
    return (
      <div
        role="alert"
        className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800"
      >
        <div className="flex items-center gap-2 font-semibold">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <span>Format Belum Mendukung Kompresi Langsung</span>
        </div>
        <p className="mt-1 text-red-700 leading-relaxed">
          Ekstensi <code className="font-mono">.{fileExt || 'bin'}</code> tidak
          mendukung kompresi in-place tanpa mengubah kontainer. Gunakan tab
          Konversi terlebih dahulu bila tersedia.
        </p>
      </div>
    );
  }

  if (privacyMode && !isSupportedPrivacy) {
    return (
      <div
        role="status"
        className="mt-5 rounded-2xl border border-blue-200 bg-[#eff6ff] p-4 text-xs text-[#1e3a8a]"
      >
        <div className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-4 w-4 text-[#2563eb] shrink-0" />
          <span>Kompresi .{fileExt.toUpperCase()} Membutuhkan Engine Server</span>
        </div>
        <p className="mt-1 text-[#1e40af] leading-relaxed">
          Mode Privasi Lokal mendukung kompresi gambar raster (JPG, PNG, WebP,
          SVG) serta data teks di memori browser. Untuk mengompresi PDF, bundel
          Office, atau media audio/video FFmpeg, nonaktifkan Mode Privasi di
          bilah atas.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 border-t border-slate-900/[0.07] pt-5 space-y-5">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span
            id="compression-profile-label"
            className="text-[13px] font-semibold text-[#0a0d14]"
          >
            Pilih profil kompresi
          </span>
          <span className="font-mono text-[11px] text-[#5b6374]">
            Sumber: {formatFileSize(selectedFile.size)}
            {privacyMode ? ' / Lokal Browser' : ''}
          </span>
        </div>

        <div
          role="radiogroup"
          aria-labelledby="compression-profile-label"
          className="grid grid-cols-1 md:grid-cols-3 gap-2.5"
        >
          {levels.map((opt) => {
            const isSelected = selectedLevel === opt.id;
            const estimatedBytes = Math.max(
              128,
              Math.round(selectedFile.size * opt.ratioMultiplier)
            );

            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedLevel(opt.id)}
                disabled={isCompressing}
                className={`relative flex flex-col justify-between rounded-2xl border p-4 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] disabled:opacity-50 ${
                  isSelected
                    ? 'border-[#111315] bg-[#111315] text-white shadow-soft'
                    : 'border-slate-900/[0.08] bg-[#f8fafc] text-[#0a0d14] hover:border-slate-900/20 hover:bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{opt.title}</span>
                    {isSelected ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[#0a0d14]">
                        <Check className="h-3 w-3 stroke-[2.5]" />
                      </span>
                    ) : (
                      <span className="rounded-full border border-slate-900/[0.08] bg-white px-2 py-0.5 text-[11px] font-medium text-[#5b6374]">
                        {opt.tag}
                      </span>
                    )}
                  </div>

                  <p
                    className={`mt-1.5 text-xs leading-relaxed ${
                      isSelected ? 'text-white/80' : 'text-[#5b6374]'
                    }`}
                  >
                    {opt.description}
                  </p>
                </div>

                <div
                  className={`mt-4 pt-3 border-t space-y-2 ${
                    isSelected ? 'border-white/15' : 'border-slate-900/[0.07]'
                  }`}
                >
                  <div
                    className={`h-1.5 w-full rounded-full overflow-hidden ${
                      isSelected ? 'bg-white/20' : 'bg-slate-900/10'
                    }`}
                  >
                    <div
                      className={`h-full rounded-full ${
                        isSelected ? 'bg-white' : 'bg-[#0a0d14]'
                      }`}
                      style={{ width: `${opt.meterPercent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="inline-flex items-center gap-1">
                      <TrendingDown className="h-3 w-3" />
                      <span>{opt.reductionRange}</span>
                    </span>
                    <span className="font-semibold">
                      ~{formatFileSize(estimatedBytes)}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onCompress(selectedLevel)}
        disabled={isCompressing}
        className="btn-primary-dark w-full py-3 text-sm"
      >
        {isCompressing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Mengompresi berkas...</span>
          </>
        ) : (
          <>
            <Minimize2 className="h-4 w-4" />
            <span>Kompres Berkas Sekarang</span>
          </>
        )}
      </button>
    </div>
  );
}
