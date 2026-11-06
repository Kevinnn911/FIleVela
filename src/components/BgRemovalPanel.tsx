// File: src/components/BgRemovalPanel.tsx

'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Eraser,
  Grid2X2,
  Layers,
  Palette,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import { BgMode } from '@/lib/bg-removal/types';

interface BgRemovalPanelProps {
  selectedFile: File;
  onRemoveBg: (options?: {
    mode?: BgMode;
    tolerance?: number;
    replacementColor?: string;
    gradientStart?: string;
    gradientEnd?: string;
  }) => void;
  isProcessing: boolean;
}

const SUPPORTED_IMAGE_EXTENSIONS = [
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
];

const SOLID_PRESETS = [
  { label: 'Merah KTP', color: '#dc2626' },
  { label: 'Biru Paspor', color: '#1e40af' },
  { label: 'Putih Studio', color: '#ffffff' },
  { label: 'Hitam Formal', color: '#09090b' },
  { label: 'Hijau Resmi', color: '#15803d' },
  { label: 'Abu Netral', color: '#52525b' },
];

const GRADIENT_PRESETS = [
  { label: 'Porcelain Mist', start: '#f8fafc', end: '#cbd5e1' },
  { label: 'Coastal Sky', start: '#e0f2fe', end: '#93c5fd' },
  { label: 'Studio Slate', start: '#64748b', end: '#1e293b' },
  { label: 'Noir Graphite', start: '#3f3f46', end: '#09090b' },
];

export function BgRemovalPanel({
  selectedFile,
  onRemoveBg,
  isProcessing,
}: BgRemovalPanelProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [tolerance, setTolerance] = useState<number>(38);
  const [mode, setMode] = useState<BgMode>('transparent');
  const [solidColor, setSolidColor] = useState<string>('#dc2626');
  const [customSolid, setCustomSolid] = useState<string>('#ffffff');
  const [gradientIndex, setGradientIndex] = useState<number>(0);

  const fileExt = selectedFile.name.split('.').pop()?.toLowerCase() || '';
  const isImage = SUPPORTED_IMAGE_EXTENSIONS.includes(fileExt);

  useEffect(() => {
    if (!isImage) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile, isImage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isImage || isProcessing) return;

    if (mode === 'solid') {
      onRemoveBg({
        mode: 'solid',
        tolerance,
        replacementColor: solidColor,
      });
    } else if (mode === 'gradient') {
      const selectedGrad =
        GRADIENT_PRESETS[gradientIndex] || GRADIENT_PRESETS[0]!;
      onRemoveBg({
        mode: 'gradient',
        tolerance,
        gradientStart: selectedGrad.start,
        gradientEnd: selectedGrad.end,
      });
    } else {
      onRemoveBg({
        mode: 'transparent',
        tolerance,
      });
    }
  };

  const activeGradient =
    GRADIENT_PRESETS[gradientIndex] || GRADIENT_PRESETS[0]!;

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-5 border-t border-slate-900/[0.07] pt-5 space-y-5"
    >
      {!isImage ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>Format Berkas Bukan Citra yang Didukung</span>
          </div>
          <p className="mt-1 text-red-700 leading-relaxed">
            Isolasi latar belakang memerlukan berkas gambar (.png, .jpg, .jpeg,
            .webp, .avif, .tiff, .bmp, .svg, .gif, .ico). Berkas saat ini (.
            {fileExt}) tidak dapat diproses di modul ini.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Left Stage: Source Image & Active Target Backdrop Indicator */}
            <div className="md:col-span-5 flex flex-col justify-between rounded-2xl border border-slate-900/[0.08] bg-[#f8fafc] p-3.5">
              <div className="flex items-center justify-between mb-2.5 text-xs">
                <span className="font-medium text-[#0a0d14]">Citra Sumber</span>
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#5b6374]">
                  <span
                    className={`h-3 w-3 rounded-sm border border-slate-900/20 ${
                      mode === 'transparent' ? 'checkerboard-premium' : ''
                    }`}
                    style={
                      mode === 'solid'
                        ? { backgroundColor: solidColor }
                        : mode === 'gradient'
                        ? {
                            background: `linear-gradient(135deg, ${activeGradient.start}, ${activeGradient.end})`,
                          }
                        : undefined
                    }
                  />
                  <span>
                    {mode === 'transparent'
                      ? 'PNG Alpha'
                      : mode === 'solid'
                      ? solidColor.toUpperCase()
                      : activeGradient.label}
                  </span>
                </span>
              </div>

              <div className="checkerboard-premium flex flex-1 min-h-[168px] items-center justify-center overflow-hidden rounded-xl border border-slate-900/[0.07] p-2.5">
                {previewUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={previewUrl}
                    alt="Pratinjau citra sumber"
                    className="max-h-40 max-w-full object-contain rounded"
                  />
                )}
              </div>
            </div>

            {/* Right Controls: Mode, Color Swatches & Edge Tolerance */}
            <div className="md:col-span-7 space-y-4">
              <div>
                <span className="block text-[13px] font-semibold text-[#0a0d14] mb-2">
                  Mode latar keluaran
                </span>

                <div
                  role="radiogroup"
                  aria-label="Mode latar keluaran"
                  className="grid grid-cols-3 gap-1 rounded-full border border-slate-900/[0.08] bg-[#f6f8fb] p-1"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={mode === 'transparent'}
                    onClick={() => setMode('transparent')}
                    className={`flex items-center justify-center gap-1.5 rounded-full py-2 px-2 text-xs transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                      mode === 'transparent'
                        ? 'bg-[#111315] text-white font-medium shadow-soft'
                        : 'text-[#5b6374] hover:text-[#0a0d14] font-medium'
                    }`}
                  >
                    <Grid2X2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Transparan</span>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={mode === 'solid'}
                    onClick={() => setMode('solid')}
                    className={`flex items-center justify-center gap-1.5 rounded-full py-2 px-2 text-xs transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                      mode === 'solid'
                        ? 'bg-[#111315] text-white font-medium shadow-soft'
                        : 'text-[#5b6374] hover:text-[#0a0d14] font-medium'
                    }`}
                  >
                    <Palette className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Pas Foto</span>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={mode === 'gradient'}
                    onClick={() => setMode('gradient')}
                    className={`flex items-center justify-center gap-1.5 rounded-full py-2 px-2 text-xs transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                      mode === 'gradient'
                        ? 'bg-[#111315] text-white font-medium shadow-soft'
                        : 'text-[#5b6374] hover:text-[#0a0d14] font-medium'
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Gradasi</span>
                  </button>
                </div>
              </div>

              {mode === 'solid' && (
                <div className="space-y-2">
                  <span className="block text-xs text-[#5b6374]">
                    Warna standar dokumen resmi (KTP, Paspor, Akademik):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {SOLID_PRESETS.map((preset) => {
                      const active = solidColor === preset.color;
                      return (
                        <button
                          key={preset.color}
                          type="button"
                          onClick={() => setSolidColor(preset.color)}
                          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                            active
                              ? 'border-[#111315] bg-[#111315] text-white font-medium'
                              : 'border-slate-900/[0.08] bg-[#f8fafc] text-[#0a0d14] hover:border-slate-900/20 font-medium'
                          }`}
                        >
                          <span
                            className="h-3.5 w-3.5 rounded-full border border-slate-900/20 shrink-0"
                            style={{ backgroundColor: preset.color }}
                          />
                          <span>{preset.label}</span>
                          {active && <Check className="h-3 w-3 shrink-0" />}
                        </button>
                      );
                    })}

                    <label
                      htmlFor="custom-solid-color"
                      className="flex items-center gap-2 rounded-full border border-slate-900/[0.08] bg-[#f8fafc] px-3 py-1.5 text-xs cursor-pointer hover:border-slate-900/20 transition-colors duration-150"
                    >
                      <span className="text-[#5b6374] font-medium">Kustom</span>
                      <input
                        id="custom-solid-color"
                        type="color"
                        aria-label="Pilih warna latar kustom"
                        value={customSolid}
                        onChange={(e) => {
                          setCustomSolid(e.target.value);
                          setSolidColor(e.target.value);
                        }}
                        className="h-4 w-4 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                      <span className="font-mono text-[11px] uppercase text-[#0a0d14]">
                        {customSolid}
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {mode === 'gradient' && (
                <div className="space-y-2">
                  <span className="block text-xs text-[#5b6374]">
                    Pilih pencahayaan latar studio:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {GRADIENT_PRESETS.map((grad, idx) => {
                      const active = gradientIndex === idx;
                      return (
                        <button
                          key={grad.label}
                          type="button"
                          onClick={() => setGradientIndex(idx)}
                          className={`flex flex-col items-center rounded-xl border p-2 text-center transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                            active
                              ? 'border-[#111315] bg-white ring-1 ring-[#111315]'
                              : 'border-slate-900/[0.08] bg-[#f8fafc] hover:border-slate-900/20'
                          }`}
                        >
                          <div
                            className="h-6 w-full rounded-lg border border-slate-900/10"
                            style={{
                              background: `linear-gradient(to bottom, ${grad.start}, ${grad.end})`,
                            }}
                          />
                          <span className="mt-1.5 text-[11px] font-medium text-[#0a0d14]">
                            {grad.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Edge Detection Sensitivity */}
              <div className="border-t border-slate-900/[0.07] pt-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="bg-tolerance-range"
                    className="flex items-center gap-1.5 text-[13px] font-medium text-[#0a0d14]"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5 text-[#5b6374]" />
                    <span>Sensitivitas flood-fill CIE-Lab</span>
                  </label>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { val: 22, label: '22 Ketat' },
                      { val: 38, label: '38 Standar' },
                      { val: 58, label: '58 Luas' },
                    ].map((preset) => (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => setTolerance(preset.val)}
                        disabled={isProcessing}
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                          tolerance === preset.val
                            ? 'border-[#111315] bg-[#111315] text-white'
                            : 'border-slate-900/[0.08] bg-[#f8fafc] text-[#5b6374] hover:border-slate-900/20 hover:text-[#0a0d14]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <span className="rounded-full border border-slate-900/[0.08] bg-[#f6f8fb] px-2.5 py-0.5 font-mono text-xs font-semibold text-[#0a0d14]">
                      {tolerance}
                    </span>
                  </div>
                </div>

                <input
                  id="bg-tolerance-range"
                  type="range"
                  min="10"
                  max="90"
                  value={tolerance}
                  onChange={(e) => setTolerance(Number(e.target.value))}
                  disabled={isProcessing}
                  className="w-full cursor-pointer"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isProcessing}
            className="btn-primary-dark w-full py-3 text-sm"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Memisahkan subjek & menghaluskan tepi...</span>
              </>
            ) : (
              <>
                <Eraser className="h-4 w-4" />
                <span>
                  {mode === 'transparent'
                    ? 'Hapus Latar Belakang (PNG Transparan)'
                    : 'Terapkan Latar Baru & Proses Gambar'}
                </span>
              </>
            )}
          </button>
        </div>
      )}
    </form>
  );
}
