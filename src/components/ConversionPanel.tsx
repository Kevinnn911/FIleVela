// File: src/components/ConversionPanel.tsx

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import {
  CapabilitiesSourceResponse,
  ConversionTarget,
} from '@/lib/adapters/types';
import { canProcessClientSide } from '@/lib/client/privacy-processor';

interface ConversionPanelProps {
  selectedFile: File;
  onConvert: (targetFormat: string, options?: Record<string, unknown>) => void;
  isConverting: boolean;
  privacyMode?: boolean;
}

export function ConversionPanel({
  selectedFile,
  onConvert,
  isConverting,
  privacyMode = false,
}: ConversionPanelProps) {
  const [capabilities, setCapabilities] =
    useState<CapabilitiesSourceResponse | null>(null);
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [quality, setQuality] = useState<number>(85);

  const fileExt =
    selectedFile.name.split('.').pop()?.toLowerCase() || 'unknown';

  useEffect(() => {
    let isMounted = true;
    setIsLoadingCapabilities(true);
    setErrorMessage(null);
    setSelectedTarget('');

    fetch(`/api/capabilities?source=${encodeURIComponent(fileExt)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data.message || data.error || 'Format sumber belum didukung'
          );
        }
        return data as CapabilitiesSourceResponse;
      })
      .then((data) => {
        if (isMounted) {
          setCapabilities(data);
          setIsLoadingCapabilities(false);
        }
      })
      .catch((err: Error) => {
        if (isMounted) {
          setErrorMessage(err.message);
          setIsLoadingCapabilities(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [fileExt]);

  const effectiveTargets = useMemo<ConversionTarget[]>(() => {
    if (!capabilities) return [];
    if (!privacyMode) return capabilities.targets;
    return capabilities.targets.filter((t) =>
      canProcessClientSide(fileExt, t.targetFormat)
    );
  }, [capabilities, privacyMode, fileExt]);

  useEffect(() => {
    if (effectiveTargets.length === 0) {
      setSelectedTarget('');
      return;
    }
    const stillValid = effectiveTargets.some(
      (t) => t.targetFormat === selectedTarget
    );
    if (!stillValid) {
      setSelectedTarget(effectiveTargets[0]?.targetFormat || '');
    }
  }, [effectiveTargets, selectedTarget]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTarget || isConverting) return;

    const options: Record<string, unknown> = {};
    if (['jpg', 'jpeg', 'webp', 'avif'].includes(selectedTarget)) {
      options.quality = quality;
    }

    onConvert(selectedTarget, options);
  };

  const currentTargetObj = effectiveTargets.find(
    (t) => t.targetFormat === selectedTarget
  );

  const showQualitySlider =
    currentTargetObj?.optionsSchema?.quality !== undefined ||
    ['jpg', 'jpeg', 'webp', 'avif'].includes(selectedTarget);

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-5 border-t border-slate-900/[0.07] pt-5 space-y-5"
    >
      {isLoadingCapabilities && (
        <div className="flex items-center justify-center gap-2.5 py-6 text-xs text-[#5b6374]">
          <RefreshCw className="h-4 w-4 animate-spin text-[#0a0d14]" />
          <span>Memuat matriks format tujuan untuk .{fileExt}...</span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>Format Sumber Belum Didukung</span>
          </div>
          <p className="mt-1 text-red-700 leading-relaxed">{errorMessage}</p>
        </div>
      )}

      {capabilities && capabilities.targets.length === 0 && (
        <div
          role="status"
          className="rounded-2xl border border-slate-900/[0.08] bg-[#f8fafc] p-4 text-xs text-[#0a0d14]"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="h-4 w-4 text-[#2563eb]" />
            <span>Tidak Ada Target Konversi Aktif</span>
          </div>
          <p className="mt-1 text-[#5b6374] leading-relaxed">
            {capabilities.unavailableAdapters?.[0]?.setupInstructions ||
              `Format .${fileExt} dikenali, namun engine konverter terkait belum aktif di server.`}
          </p>
        </div>
      )}

      {capabilities &&
        capabilities.targets.length > 0 &&
        privacyMode &&
        effectiveTargets.length === 0 && (
          <div
            role="status"
            className="rounded-2xl border border-blue-200 bg-[#eff6ff] p-4 text-xs text-[#1e3a8a]"
          >
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-[#2563eb] shrink-0" />
              <span>Membutuhkan Engine Sandbox Server</span>
            </div>
            <p className="mt-1 text-[#1e40af] leading-relaxed">
              Format <code className="font-mono font-semibold">.{fileExt}</code>{' '}
              memiliki {capabilities.targets.length} target di server, namun
              tidak dapat ditranskode secara offline di memori browser.
              Nonaktifkan Mode Privasi di bilah atas untuk memproses di sandbox
              terisolasi (TTL 60 menit).
            </p>
          </div>
        )}

      {effectiveTargets.length > 0 && (
        <div className="space-y-5">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span
                id="target-format-label"
                className="text-[13px] font-semibold text-[#0a0d14]"
              >
                Pilih format keluaran
              </span>
              <span className="font-mono text-[11px] text-[#5b6374]">
                {effectiveTargets.length} opsi kompatibel
                {privacyMode ? ' (Lokal Browser)' : ''}
              </span>
            </div>

            <div
              role="radiogroup"
              aria-labelledby="target-format-label"
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2"
            >
              {effectiveTargets.map((t: ConversionTarget) => {
                const isSelected = selectedTarget === t.targetFormat;
                return (
                  <button
                    key={t.targetFormat}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={isConverting}
                    onClick={() => setSelectedTarget(t.targetFormat)}
                    className={`group flex flex-col justify-between rounded-2xl border p-3 text-left transition-colors duration-150 min-h-[62px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] disabled:opacity-50 ${
                      isSelected
                        ? 'border-[#111315] bg-[#111315] text-white shadow-soft'
                        : 'border-slate-900/[0.08] bg-[#f8fafc] text-[#0a0d14] hover:border-slate-900/20 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-mono text-xs font-semibold uppercase tracking-tight">
                        .{t.targetFormat}
                      </span>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" />
                      )}
                    </div>
                    <span
                      className={`mt-1 truncate text-[11px] ${
                        isSelected ? 'text-white/80 font-medium' : 'text-[#5b6374]'
                      }`}
                    >
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {showQualitySlider && (
            <div className="border-t border-slate-900/[0.07] pt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="conversion-quality-range"
                  className="flex items-center gap-2 text-[13px] font-medium text-[#0a0d14]"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-[#5b6374]" />
                  <span>Kualitas kompresi citra</span>
                </label>

                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { value: 70, label: '70% Hemat' },
                    { value: 85, label: '85% Standar' },
                    { value: 95, label: '95% Tinggi' },
                  ].map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setQuality(preset.value)}
                      disabled={isConverting}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                        quality === preset.value
                          ? 'border-[#111315] bg-[#111315] text-white'
                          : 'border-slate-900/[0.08] bg-[#f8fafc] text-[#5b6374] hover:border-slate-900/20 hover:text-[#0a0d14]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <span className="ml-1 rounded-full border border-slate-900/[0.08] bg-[#f6f8fb] px-2.5 py-1 font-mono text-xs font-semibold text-[#0a0d14]">
                    {quality}%
                  </span>
                </div>
              </div>

              <input
                id="conversion-quality-range"
                type="range"
                min="10"
                max="100"
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                disabled={isConverting}
                className="w-full cursor-pointer"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={!selectedTarget || isConverting}
            className="btn-primary-dark w-full py-3 text-sm"
          >
            {isConverting ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>
                  Mengonversi berkas ke .{selectedTarget.toUpperCase()}...
                </span>
              </>
            ) : (
              <>
                <span>Konversi ke .{selectedTarget.toUpperCase()}</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      )}
    </form>
  );
}
