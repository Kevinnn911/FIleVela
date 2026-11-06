// File: src/components/Footer.tsx

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Clock, Lock, ShieldCheck } from 'lucide-react';

interface FooterProps {
  compact?: boolean;
}

export function Footer({ compact = false }: FooterProps) {
  return (
    <footer className="mt-auto border-t border-slate-900/[0.07] bg-white text-xs text-[#5b6374]">
      <div className="mx-auto max-w-[1140px] px-4 sm:px-6">
        <div
          className={`grid grid-cols-1 gap-3 border-b border-slate-900/[0.06] sm:grid-cols-3 sm:gap-6 ${
            compact ? 'py-4' : 'py-6'
          }`}
        >
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 shrink-0 text-[#0a0d14]" />
            <span>
              <strong className="font-semibold text-[#0a0d14]">
                Isolasi SHA-256:
              </strong>{' '}
              Akses berkas terkunci token sesi 256-bit
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 shrink-0 text-[#0a0d14]" />
            <span>
              <strong className="font-semibold text-[#0a0d14]">
                TTL 60 Menit:
              </strong>{' '}
              Pembersihan otomatis & opsi hapus instan
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#0a0d14]" />
            <span>
              <strong className="font-semibold text-[#0a0d14]">
                Transcoding Asli:
              </strong>{' '}
              Validasi magic-bytes tanpa pemalsuan ekstensi
            </span>
          </div>
        </div>

        <div
          className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs ${
            compact ? 'py-4' : 'py-6'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-[6px] bg-[#111315] shrink-0">
              <Image
                src="/Logo.png"
                alt="FileVela"
                width={12}
                height={12}
                className="h-3 w-3 object-contain brightness-0 invert"
              />
            </span>
            <p className="text-[#5b6374]">
              FileVela Workstation (c) 2026. Pemrosesan berkas terisolasi & lokal.
            </p>
          </div>

          <nav
            aria-label="Tautan informasi dan hukum"
            className="flex flex-wrap items-center gap-5 font-medium text-[#5b6374]"
          >
            <Link
              href="/docs"
              className="hover:text-[#0a0d14] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] rounded"
            >
              Dokumentasi & API
            </Link>
            <Link
              href="/privacy"
              className="hover:text-[#0a0d14] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] rounded"
            >
              Kebijakan Privasi
            </Link>
            <Link
              href="/terms"
              className="hover:text-[#0a0d14] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] rounded"
            >
              Syarat & Ketentuan
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
