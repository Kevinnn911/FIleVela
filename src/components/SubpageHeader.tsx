// File: src/components/SubpageHeader.tsx

'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

export interface SubpageHeaderProps {
  currentPage: 'docs' | 'privacy' | 'terms';
}

const NAV_ITEMS: Array<{
  id: 'docs' | 'privacy' | 'terms';
  label: string;
  href: string;
}> = [
  { id: 'docs', label: 'Dokumentasi', href: '/docs' },
  { id: 'privacy', label: 'Privasi', href: '/privacy' },
  { id: 'terms', label: 'Ketentuan', href: '/terms' },
];

export function SubpageHeader({ currentPage }: SubpageHeaderProps) {
  const [isScrolled, setIsScrolled] = useState<boolean>(false);
  const isScrolledRef = useRef<boolean>(false);

  useEffect(() => {
    const syncScroll = () => {
      const currentY = window.scrollY || window.pageYOffset || 0;
      const nextScrolled = currentY > 16;
      if (nextScrolled !== isScrolledRef.current) {
        isScrolledRef.current = nextScrolled;
        setIsScrolled(nextScrolled);
      }
    };

    syncScroll();
    window.addEventListener('scroll', syncScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', syncScroll);
    };
  }, []);

  return (
    <header
      data-scrolled={isScrolled ? 'true' : 'false'}
      className="sticky top-0 z-40 w-full pointer-events-none navbar-notch-shell"
    >
      <div
        data-testid="subpage-notch-surface"
        data-scrolled={isScrolled ? 'true' : 'false'}
        className="pointer-events-auto navbar-notch-surface navbar-notch-surface--subpage"
      >
        <div className="mx-auto flex h-full w-full max-w-[1140px] flex-wrap md:flex-nowrap items-center justify-between gap-x-2 gap-y-1.5">
          <div className="order-1 flex items-center gap-2 sm:gap-4 min-w-0">
            <Link
              href="/"
              className="flex items-center gap-1.5 sm:gap-2.5 rounded-full py-1 pr-1.5 sm:pr-2 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
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
            </Link>

            <span
              aria-hidden="true"
              className="hidden md:block h-4 w-px bg-slate-900/10"
            />
          </div>

          <nav
            aria-label="Navigasi dokumen"
            className="order-3 md:order-2 flex w-full md:w-auto items-center justify-center md:justify-start gap-1 border-t border-slate-900/[0.06] md:border-t-0 pt-1.5 md:pt-0"
          >
            {NAV_ITEMS.map((item) => {
              const isCurrent = item.id === currentPage;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`flex-1 md:flex-initial text-center rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11.5px] sm:text-[13px] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                    isCurrent
                      ? 'bg-[#111315] text-white font-medium'
                      : 'text-[#5b6374] hover:text-[#0a0d14] font-medium'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="order-2 md:order-3 flex items-center gap-1.5 sm:gap-2 shrink-0">
            <ThemeToggle />

            <Link
              href="/#studio"
              className="btn-primary-dark min-h-[32px] sm:min-h-[36px] px-2.5 sm:px-4 py-1 sm:py-1.5 text-[11px] sm:text-xs whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Buka Studio</span>
              <span className="sm:hidden">Studio</span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
