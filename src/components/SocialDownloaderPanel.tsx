// File: src/components/SocialDownloaderPanel.tsx

'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clipboard,
  Clock,
  DownloadCloud,
  Link2,
  Music,
  Play,
  RefreshCw,
  Video,
  X,
} from 'lucide-react';
import { MediaFormatOption, MediaMetadata } from '@/lib/downloader/types';

const SUPPORTED_PLATFORMS = [
  'TikTok (No-Watermark)',
  'YouTube & Shorts',
  'Instagram Reels',
  'X (Twitter)',
  'Facebook & Vimeo',
];

function sanitizeClientDownloadName(title: string, ext: string): string {
  const cleanStem = title
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96);
  return `${cleanStem || 'media_fileflow'}.${ext}`;
}

export function SocialDownloaderPanel() {
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadStage, setDownloadStage] = useState('');
  const [metadata, setMetadata] = useState<MediaMetadata | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] =
    useState<MediaFormatOption | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  useEffect(() => {
    let timer1: NodeJS.Timeout;
    let timer2: NodeJS.Timeout;
    let timer3: NodeJS.Timeout;

    if (isDownloading) {
      setDownloadStage('Menghubungi sumber stream publik...');
      timer1 = setTimeout(() => {
        setDownloadStage('Mengambil aliran bitstream asli...');
      }, 2500);

      timer2 = setTimeout(() => {
        setDownloadStage('Memproses muxing & pengemasan FFmpeg...');
      }, 6000);

      timer3 = setTimeout(() => {
        setDownloadStage('Mengalirkan berkas ke perangkat Anda...');
      }, 10000);
    } else {
      setDownloadStage('');
    }

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [isDownloading]);

  const handleInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);
    setMetadata(null);
    setSelectedFormat(null);
    setDownloadSuccess(false);

    try {
      const response = await fetch('/api/downloader/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || data.error || 'Gagal mengurai tautan media.'
        );
      }

      setMetadata(data.metadata);
      if (data.metadata?.availableFormats?.length > 0) {
        setSelectedFormat(data.metadata.availableFormats[0]!);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan saat memeriksa tautan.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrlInput(text.trim());
        setErrorMessage(null);
      }
    } catch {
      // Clipboard read denied by browser permissions
    }
  };

  const handleClear = () => {
    setUrlInput('');
    setMetadata(null);
    setSelectedFormat(null);
    setErrorMessage(null);
    setDownloadSuccess(false);
  };

  const handleDownload = async () => {
    if (!metadata || !selectedFormat || isDownloading) return;

    setIsDownloading(true);
    setErrorMessage(null);
    setDownloadSuccess(false);

    const downloadEndpoint = `/api/downloader/download?url=${encodeURIComponent(
      metadata.url
    )}&format=${selectedFormat.format}&quality=${encodeURIComponent(
      selectedFormat.quality
    )}&title=${encodeURIComponent(metadata.title)}`;

    try {
      const response = await fetch(downloadEndpoint);
      if (!response.ok) {
        let errorMsg = 'Gagal memproses unduhan media.';
        try {
          const errData = await response.json();
          errorMsg = errData.message || errData.error || errorMsg;
        } catch {
          // Ignore non-JSON body parse failure
        }
        throw new Error(errorMsg);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const directLink = document.createElement('a');
      directLink.href = blobUrl;
      directLink.download = sanitizeClientDownloadName(
        metadata.title,
        selectedFormat.format
      );
      document.body.appendChild(directLink);
      directLink.click();
      document.body.removeChild(directLink);
      window.URL.revokeObjectURL(blobUrl);

      setDownloadSuccess(true);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat mengunduh.'
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="w-full space-y-5">
      {!metadata ? (
        <div className="py-2 sm:py-3 space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="socialUrlInput"
              className="block text-sm font-semibold text-[#0a0d14]"
            >
              Tautan media publik
            </label>
            <p className="text-xs text-[#4e5666]">
              Masukkan URL video publik untuk menginspeksi resolusi MP4 asli
              tanpa watermark atau mengekstrak trek audio MP3.
            </p>
          </div>

          <form onSubmit={handleInspect}>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-[22px] sm:rounded-full border border-slate-900/12 bg-[#f6f8fb] p-1.5 focus-within:border-[#111315] focus-within:bg-white transition-colors">
              <div className="relative flex-1 flex items-center">
                <Link2 className="ml-3.5 h-4 w-4 shrink-0 text-[#2563eb]" />
                <input
                  id="socialUrlInput"
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://www.tiktok.com/... atau https://youtu.be/..."
                  disabled={isLoading || isDownloading}
                  className="h-10 w-full bg-transparent pl-3 pr-24 text-xs sm:text-[13px] text-[#0a0d14] placeholder:text-[#6c7586] focus:outline-none"
                />

                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center">
                  {urlInput.trim() ? (
                    <button
                      type="button"
                      onClick={() => setUrlInput('')}
                      disabled={isLoading || isDownloading}
                      aria-label="Bersihkan tautan"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-[#4e5666] hover:bg-slate-900/5 hover:text-[#0a0d14] transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handlePaste}
                      disabled={isLoading || isDownloading}
                      className="btn-ghost-clean min-h-[32px] px-3 py-1 text-xs bg-white"
                    >
                      <Clipboard className="h-3.5 w-3.5 text-[#2563eb]" />
                      <span>Tempel</span>
                    </button>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={!urlInput.trim() || isLoading || isDownloading}
                className="btn-primary-dark min-h-[40px] px-5 py-2 text-xs sm:text-[13px] shrink-0"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Memeriksa...</span>
                  </>
                ) : (
                  <>
                    <span>Ekstrak Stream</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-medium text-[#4e5666]">
              Platform didukung:
            </span>
            {SUPPORTED_PLATFORMS.map((platform) => (
              <span
                key={platform}
                className="rounded-full border border-slate-900/8 bg-[#f6f8fb] px-2.5 py-0.5 font-mono text-[11px] text-[#4e5666]"
              >
                {platform}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Extracted Media Metadata Strip */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-900/10 bg-[#f6f8fb] p-3.5 sm:p-4">
            <div className="flex items-center gap-3.5 min-w-0">
              {metadata.thumbnailUrl ? (
                <div className="relative aspect-video h-12 shrink-0 overflow-hidden rounded-xl border border-slate-900/10 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={metadata.thumbnailUrl}
                    alt={metadata.title}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play className="h-3.5 w-3.5 fill-white text-white" />
                  </div>
                </div>
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-900/10 bg-white shadow-sm">
                  <Video className="h-5 w-5 text-[#2563eb]" />
                </div>
              )}

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#0a0d14]">
                  {metadata.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#4e5666]">
                  <span className="rounded-full border border-slate-900/10 bg-white px-2 py-0.5 font-mono text-[11px] font-semibold uppercase text-[#0a0d14]">
                    {metadata.platformName}
                  </span>
                  {metadata.author && (
                    <span className="truncate max-w-[180px] text-[#0a0d14] font-medium">
                      {metadata.author}
                    </span>
                  )}
                  {(metadata.durationSeconds ?? 0) > 0 &&
                    metadata.durationFormatted && (
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#4e5666]">
                        <Clock className="h-3 w-3" />
                        <span>{metadata.durationFormatted}</span>
                      </span>
                    )}
                  <span className="inline-flex items-center gap-1 font-medium text-[#1d4ed8]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Stream siap</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <button
                type="button"
                onClick={handleClear}
                disabled={isDownloading}
                className="btn-ghost-clean min-h-[36px] px-3.5 py-1.5 text-xs bg-white"
              >
                Ganti Tautan
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={isDownloading}
                aria-label="Batalkan ekstraksi"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-900/10 bg-white text-[#4e5666] hover:border-slate-900/20 hover:text-[#0a0d14] transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Stream Output Options */}
          <div className="border-t border-slate-900/8 pt-4 space-y-3">
            <span className="block text-[13px] font-semibold text-[#0a0d14]">
              Pilih format & resolusi stream
            </span>

            <div
              role="radiogroup"
              aria-label="Pilih format dan resolusi stream"
              className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
            >
              {metadata.availableFormats.map((formatOption) => {
                const isSelected =
                  selectedFormat?.format === formatOption.format &&
                  selectedFormat?.quality === formatOption.quality;
                const isAudio = formatOption.format === 'mp3';

                return (
                  <button
                    key={`${formatOption.format}-${formatOption.quality}`}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedFormat(formatOption)}
                    disabled={isDownloading}
                    className={`flex items-start justify-between rounded-2xl border p-3.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] disabled:opacity-50 ${
                      isSelected
                        ? 'border-[#111315] bg-[#111315] text-white shadow-sm'
                        : 'border-slate-900/10 bg-[#f6f8fb] text-[#0a0d14] hover:border-slate-900/20 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`rounded-xl p-2 ${
                          isSelected
                            ? 'bg-white/15 text-white'
                            : 'bg-white border border-slate-900/8 text-[#2563eb]'
                        }`}
                      >
                        {isAudio ? (
                          <Music className="h-4 w-4" />
                        ) : (
                          <Video className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold uppercase">
                            .{formatOption.format}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-medium ${
                              isSelected
                                ? 'bg-white/15 text-white'
                                : 'bg-white border border-slate-900/8 text-[#0a0d14]'
                            }`}
                          >
                            {formatOption.quality}
                          </span>
                          {formatOption.approxSize && (
                            <span
                              className={`font-mono text-[11px] ${
                                isSelected ? 'text-white/80' : 'text-[#4e5666]'
                              }`}
                            >
                              {formatOption.approxSize}
                            </span>
                          )}
                        </div>
                        <p
                          className={`mt-1 text-xs ${
                            isSelected ? 'text-white/80' : 'text-[#4e5666]'
                          }`}
                        >
                          {formatOption.label ||
                            (isAudio
                              ? 'Ekstraksi trek audio murni'
                              : 'Aliran video tanpa watermark')}
                        </p>
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 stroke-[2.5]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedFormat && (
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                className="btn-primary-dark w-full py-3 text-sm"
              >
                {isDownloading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>{downloadStage || 'Memproses unduhan media...'}</span>
                  </>
                ) : (
                  <>
                    <DownloadCloud className="h-4 w-4" />
                    <span>
                      Unduh .{selectedFormat.format.toUpperCase()} (
                      {selectedFormat.quality})
                    </span>
                  </>
                )}
              </button>

              {downloadSuccess && (
                <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-[#1d4ed8]">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Berkas media berhasil diunduh ke perangkat Anda.</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50/90 p-4 text-xs text-red-900"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold">Tidak dapat memproses tautan</span>
            <p className="mt-0.5 text-red-900/90">{errorMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
