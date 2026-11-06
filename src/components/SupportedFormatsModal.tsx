// File: src/components/SupportedFormatsModal.tsx

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  CapabilitiesCatalogResponse,
  FormatCapability,
} from '@/lib/adapters/types';

interface SupportedFormatsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SupportedFormatsModal({
  isOpen,
  onClose,
}: SupportedFormatsModalProps) {
  const [catalog, setCatalog] =
    useState<CapabilitiesCatalogResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    fetch('/api/capabilities')
      .then((res) => {
        if (!res.ok) {
          throw new Error('Gagal memuat katalog format dan status adapter');
        }
        return res.json();
      })
      .then((data: CapabilitiesCatalogResponse) => {
        if (isMounted) {
          setCatalog(data);
          setIsLoading(false);
        }
      })
      .catch((err: Error) => {
        if (isMounted) {
          setError(err.message);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const filteredFormats = useMemo(() => {
    if (!catalog) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catalog.supportedSources;
    return catalog.supportedSources.filter(
      (fmt) =>
        fmt.format.toLowerCase().includes(q) ||
        fmt.label.toLowerCase().includes(q) ||
        fmt.category.toLowerCase().includes(q)
    );
  }, [catalog, searchQuery]);

  if (!isOpen) return null;

  const groupedFormats = filteredFormats.reduce<
    Record<string, FormatCapability[]>
  >((acc, item) => {
    const key = item.category || 'lainnya';
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key]!.push(item);
    return acc;
  }, {});

  const categoryLabels: Record<string, string> = {
    image: 'Citra Raster & Vektor',
    document: 'Dokumen & Publikasi',
    data: 'Data Terstruktur',
    audio: 'Audio & Suara',
    video: 'Video & Stream',
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="formats-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm"
    >
      <div className="surface-elevated flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden text-[#0a0d14]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-900/[0.07] px-6 py-5">
          <div className="space-y-1">
            <h2
              id="formats-modal-title"
              className="font-brand text-lg font-semibold tracking-[-0.02em] text-[#0a0d14]"
            >
              Matriks Format &amp; Status Engine Runtime
            </h2>
            <p className="text-xs text-[#4e5666]">
              Seluruh format yang diverifikasi secara langsung oleh adapter
              aktif tanpa konversi semu.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-900/[0.08] bg-[#f6f8fb] text-[#4e5666] hover:bg-[#eef2f7] hover:text-[#0a0d14] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-900/[0.06] bg-[#f8fafc] px-6 py-3.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6c7586]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari ekstensi atau kategori (misal: pdf, docx, webp, mp4, xlsx)..."
              aria-label="Cari format berkas"
              className="w-full rounded-full border border-slate-900/[0.09] bg-white py-2 pl-10 pr-4 text-xs text-[#0a0d14] placeholder:text-[#6c7586] focus:border-[#0a0d14] focus:outline-none"
            />
          </div>
        </div>

        <div
          data-slide-scrollable="true"
          className="flex-1 overflow-y-auto px-6 py-5 space-y-6"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2.5 py-14 text-xs text-[#4e5666]">
              <RefreshCw className="h-4 w-4 animate-spin text-[#0a0d14]" />
              <span>Memeriksa ketersediaan adapter runtime...</span>
            </div>
          ) : error ? (
            <div className="flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50/90 p-4 text-xs text-red-900">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : catalog ? (
            <>
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-[#0a0d14]">
                  Status Adapter Aktif ({catalog.totalActiveAdapters} /{' '}
                  {catalog.totalAdapters})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {catalog.adapters.map((adapter) => (
                    <div
                      key={adapter.id}
                      className="flex items-center justify-between gap-2 rounded-2xl border border-slate-900/[0.06] bg-[#f6f8fb] px-3.5 py-2.5 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="block font-medium text-[#0a0d14] truncate">
                          {adapter.name}
                        </span>
                        <span className="font-mono text-[10px] text-[#4e5666]">
                          {adapter.supportedSourcesCount} format sumber
                        </span>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium shrink-0 ${
                          adapter.isAvailable
                            ? 'bg-[#f0f6ff] text-[#1e40af] border border-blue-200/80'
                            : 'bg-slate-200/70 text-[#4e5666]'
                        }`}
                      >
                        {adapter.isAvailable && (
                          <CheckCircle2 className="h-3 w-3 text-[#2563eb]" />
                        )}
                        {adapter.isAvailable ? 'Aktif' : 'Opsional'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-semibold text-[#0a0d14]">
                  Ekstensi Sumber Terdaftar ({filteredFormats.length})
                </p>

                {Object.keys(groupedFormats).length === 0 ? (
                  <p className="py-6 text-center text-xs text-[#4e5666]">
                    Tidak ada format yang cocok dengan kata kunci pencarian.
                  </p>
                ) : (
                  Object.entries(groupedFormats).map(([category, items]) => (
                    <div key={category} className="space-y-2">
                      <p className="text-xs font-medium text-[#4e5666]">
                        {categoryLabels[category] || category}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((fmt) => (
                          <span
                            key={fmt.format}
                            title={`${fmt.label} (${fmt.mimeType})`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-slate-900/[0.08] bg-white px-3 py-1 font-mono text-xs font-medium text-[#0a0d14]"
                          >
                            <span>.{fmt.format.toUpperCase()}</span>
                            <span className="font-sans text-[10.5px] font-normal text-[#4e5666]">
                              {fmt.label}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-slate-900/[0.06] bg-[#f8fafc] px-6 py-3.5 text-xs text-[#4e5666]">
          <span>Validasi signature magic-bytes aktif di setiap unggahan</span>
          <button
            type="button"
            onClick={onClose}
            className="btn-primary-dark min-h-[34px] px-4 py-1.5 text-xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
