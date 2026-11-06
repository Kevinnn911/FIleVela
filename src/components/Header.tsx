// File: src/components/Header.tsx

'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Shield, ShieldCheck } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

export type ActiveTab =
  | 'convert'
  | 'compress'
  | 'bg-remove'
  | 'pdf-tools'
  | 'downloader';

export interface HeaderProps {
  activeSlide?: number;
  onNavigateSlide?: (slideIndex: number) => void;
  onOpenFormatsModal?: () => void;
  privacyMode?: boolean;
  onTogglePrivacyMode?: () => void;
}

const SLIDE_NAV_ITEMS: Array<{ label: string; slideIndex: number; href: string }> =
  [
    { label: 'Beranda', slideIndex: 0, href: '#beranda' },
    { label: 'Studio', slideIndex: 1, href: '#studio' },
    { label: 'Kapabilitas', slideIndex: 2, href: '#fitur' },
    { label: 'Privasi', slideIndex: 3, href: '#privasi' },
    { label: 'FAQ', slideIndex: 4, href: '#faq' },
  ];

export function Header({
  activeSlide = 0,
  onNavigateSlide,
  privacyMode = false,
  onTogglePrivacyMode,
}: HeaderProps) {
  const [isPastTopThreshold, setIsPastTopThreshold] = useState<boolean>(false);
  const isPastTopRef = useRef<boolean>(false);

  useEffect(() => {
    const syncScroll = () => {
      const currentY = window.scrollY || window.pageYOffset || 0;
      const nextPastTop = currentY > 16;
      if (nextPastTop !== isPastTopRef.current) {
        isPastTopRef.current = nextPastTop;
        setIsPastTopThreshold(nextPastTop);
      }
    };

    syncScroll();
    window.addEventListener('scroll', syncScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', syncScroll);
    };
  }, []);

  const isScrolled = activeSlide > 0 || isPastTopThreshold;

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    slideIndex: number
  ) => {
    if (onNavigateSlide) {
      e.preventDefault();
      onNavigateSlide(slideIndex);
    }
  };

  return (
    <header
      data-scrolled={isScrolled ? 'true' : 'false'}
      className="fixed top-0 left-0 right-0 z-40 pointer-events-none navbar-notch-shell"
    >
      <div
        data-testid="navbar-notch-surface"
        data-scrolled={isScrolled ? 'true' : 'false'}
        className="pointer-events-auto navbar-notch-surface"
      >
        <div className="mx-auto flex h-full w-full max-w-[1140px] items-center justify-between gap-1.5 sm:gap-2.5 min-w-0">
          {/* Minimal Monochrome Geometric Brand Mark */}
          <a
            href="#beranda"
            onClick={(e) => handleNavClick(e, 0)}
            className="flex items-center gap-1.5 sm:gap-2.5 rounded-full py-1 pr-1 sm:pr-2 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
          >
            <span className="inline-flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-[8px] sm:rounded-[9px] bg-[#111315] text-white shadow-soft shrink-0">
              <Image
                src="/Logo.png"
                alt="FileVela Logo"
                width={16}
                height={16}
                className="h-3 w-3 sm:h-3.5 sm:w-3.5 object-contain brightness-0 invert"
                priority
              />
            </span>
            <span className="font-brand text-[14px] sm:text-[15.5px] font-semibold tracking-[-0.025em] text-[#0a0d14]">
              FileVela
            </span>
          </a>

          {/* Clean Centered Editorial Navigation (Tightens into Capsules inside Notch) */}
          <nav
            aria-label="Navigasi bagian utama"
            className={`hidden lg:flex items-center text-[13px] font-medium ${
              isScrolled ? 'gap-1' : 'gap-6'
            }`}
          >
            {SLIDE_NAV_ITEMS.map((item) => {
              const isActive = activeSlide === item.slideIndex;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(e) => handleNavClick(e, item.slideIndex)}
                  className={`rounded-full transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                    isScrolled ? 'px-2.5 py-1 text-[12.5px]' : 'px-1.5 py-0.5'
                  } ${
                    isActive
                      ? isScrolled
                        ? 'bg-[#f1f4f9] text-[#0a0d14] font-semibold'
                        : 'text-[#0a0d14] font-semibold'
                      : 'text-[#5b6374] hover:text-[#0a0d14]'
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
            <Link
              href="/docs"
              className={`rounded-full text-[#5b6374] hover:text-[#0a0d14] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                isScrolled ? 'px-2.5 py-1 text-[12.5px]' : 'px-1.5 py-0.5'
              }`}
            >
              Dokumentasi
            </Link>
          </nav>

          {/* Right Controls: Theme Toggle (Light/Dark), Privacy Lock, & Concentric Matte-Black CTA Pill */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <ThemeToggle />

            {onTogglePrivacyMode && (
              <button
                type="button"
                onClick={onTogglePrivacyMode}
                aria-pressed={privacyMode}
                title={
                  privacyMode
                    ? 'Mode Privasi Lokal Aktif: Pemrosesan 100% di memori browser tanpa unggah server'
                    : 'Aktifkan Mode Privasi Lokal (Tanpa unggah server)'
                }
                className={`inline-flex min-h-[32px] sm:min-h-[36px] items-center gap-1 sm:gap-1.5 rounded-full border px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-medium whitespace-nowrap transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                  privacyMode
                    ? 'border-[#2563eb]/25 bg-[#eff6ff] text-[#1d4ed8]'
                    : 'border-slate-900/[0.08] bg-[#f6f8fb] text-[#4e5666] hover:text-[#0a0d14]'
                }`}
              >
                {privacyMode ? (
                  <ShieldCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[#2563eb] shrink-0" />
                ) : (
                  <Shield className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[#5b6374] shrink-0" />
                )}
                <span className="hidden md:inline">
                  {privacyMode ? 'Privasi Aktif' : 'Mode Privasi'}
                </span>
                <span className="md:hidden">Privasi</span>
              </button>
            )}

            {onNavigateSlide && (
              <button
                type="button"
                onClick={() => onNavigateSlide(1)}
                className="btn-primary-dark min-h-[32px] sm:min-h-[36px] px-2.5 sm:px-4 py-1 sm:py-1.5 text-[11px] sm:text-xs whitespace-nowrap"
              >
                <span>{activeSlide === 1 ? 'Studio Aktif' : 'Buka Studio'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
