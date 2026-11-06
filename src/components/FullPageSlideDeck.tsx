// File: src/components/FullPageSlideDeck.tsx

'use client';

import React, { useCallback, useEffect, useRef } from 'react';

export interface SlideDefinition {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface FullPageSlideDeckProps {
  slides: SlideDefinition[];
  activeSlide: number;
  onSlideChange: (nextIndex: number) => void;
  isModalOpen?: boolean;
}

interface SectionMetric {
  startY: number;
  endY: number;
  height: number;
}

export function FullPageSlideDeck({
  slides,
  activeSlide,
  onSlideChange,
}: FullPageSlideDeckProps) {
  const deckRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);
  const veilRefs = useRef<Array<HTMLDivElement | null>>([]);
  const lastCoverStrRef = useRef<string[]>([]);

  const slidesRef = useRef<SlideDefinition[]>(slides);
  slidesRef.current = slides;

  const onSlideChangeRef = useRef<(nextIndex: number) => void>(onSlideChange);
  onSlideChangeRef.current = onSlideChange;

  const activeSlideRef = useRef<number>(activeSlide);
  activeSlideRef.current = activeSlide;

  const lastSyncedFromScrollRef = useRef<number>(activeSlide);
  const isAnimatingScrollRef = useRef<boolean>(false);
  const rafIdRef = useRef<number | null>(null);

  const cachedMetricsRef = useRef<{ vh: number; metrics: SectionMetric[] }>({
    vh: 800,
    metrics: [],
  });
  const lastViewportHeightRef = useRef<number>(0);

  const cancelRunningAnimation = useCallback(() => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    isAnimatingScrollRef.current = false;
  }, []);

  // Batch DOM reads first, then batch DOM writes (zero layout thrashing)
  const measureLayout = useCallback(() => {
    if (typeof window === 'undefined') return cachedMetricsRef.current;

    const vh = window.innerHeight > 0 ? window.innerHeight : 800;
    const deckTop = deckRef.current?.offsetTop ?? 0;
    const count = slidesRef.current.length;

    // Pass 1: Read all heights without mutating styles
    const heights: number[] = new Array(count);
    for (let i = 0; i < count; i++) {
      const el = sectionRefs.current[i];
      const rawHeight = el ? el.offsetHeight : 0;
      heights[i] = rawHeight > 0 ? Math.max(vh, rawHeight) : vh;
    }

    // Pass 2: Write sticky top offsets and build cumulative metrics
    let cursorY = deckTop;
    const metrics: SectionMetric[] = new Array(count);

    for (let i = 0; i < count; i++) {
      const height = heights[i] ?? vh;
      const el = sectionRefs.current[i];
      if (el) {
        const stickyTop = Math.min(0, vh - height);
        const nextTopStr = `${stickyTop}px`;
        if (el.style.top !== nextTopStr) {
          el.style.top = nextTopStr;
        }
      }

      const startY = cursorY;
      const endY = startY + height;
      cursorY = endY;
      metrics[i] = { startY, endY, height };
    }

    lastViewportHeightRef.current = vh;
    cachedMetricsRef.current = { vh, metrics };
    return cachedMetricsRef.current;
  }, []);

  // Zero-reflow scroll handler: uses cached metrics and only touches changed attributes/veils
  const syncScrollProgress = useCallback(() => {
    if (typeof window === 'undefined') return;

    const currentVh = window.innerHeight > 0 ? window.innerHeight : 800;
    if (
      cachedMetricsRef.current.metrics.length !== slidesRef.current.length ||
      lastViewportHeightRef.current !== currentVh
    ) {
      measureLayout();
    }

    const { vh, metrics } = cachedMetricsRef.current;
    const scrollY = Math.max(0, window.scrollY || window.pageYOffset || 0);

    let bestIdx = 0;

    for (let i = 0; i < metrics.length; i++) {
      const metric = metrics[i];
      if (!metric) continue;

      if (i > 0 && scrollY >= metric.startY - vh * 0.5) {
        bestIdx = i;
      }

      let coverProgress = 0;
      if (i < metrics.length - 1) {
        const overlapStart = metric.endY - vh;
        const rawProgress = vh > 0 ? (scrollY - overlapStart) / vh : 0;
        coverProgress = Math.max(0, Math.min(1, rawProgress));
      }

      const coverStr = coverProgress.toFixed(3);
      if (lastCoverStrRef.current[i] !== coverStr) {
        lastCoverStrRef.current[i] = coverStr;

        const sectionEl = sectionRefs.current[i];
        if (sectionEl) {
          sectionEl.setAttribute('data-cover-progress', coverStr);
        }

        const veilEl = veilRefs.current[i];
        if (veilEl) {
          veilEl.style.opacity =
            coverProgress > 0 ? (coverProgress * 0.06).toFixed(3) : '0';
        }
      }
    }

    if (!isAnimatingScrollRef.current && bestIdx !== activeSlideRef.current) {
      lastSyncedFromScrollRef.current = bestIdx;
      activeSlideRef.current = bestIdx;
      onSlideChangeRef.current(bestIdx);
    }
  }, [measureLayout]);

  const animateWindowToSlide = useCallback(
    (targetIndex: number) => {
      if (typeof window === 'undefined') return;
      const { metrics } = measureLayout();
      const targetMetric = metrics[targetIndex];
      if (!targetMetric) return;

      cancelRunningAnimation();

      const targetTop = targetMetric.startY;
      const startTop = window.scrollY || window.pageYOffset || 0;
      const distance = targetTop - startTop;

      const prefersReducedMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (
        prefersReducedMotion ||
        Math.abs(distance) < 2 ||
        typeof window.requestAnimationFrame !== 'function'
      ) {
        window.scrollTo(0, targetTop);
        syncScrollProgress();
        return;
      }

      isAnimatingScrollRef.current = true;
      const durationMs = 540;
      const startTime = performance.now();

      const stepFrame = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, Math.max(0, elapsed / durationMs));
        const eased = 1 - Math.pow(1 - progress, 4);

        window.scrollTo(0, Math.round(startTop + distance * eased));
        syncScrollProgress();

        if (progress < 1) {
          rafIdRef.current = window.requestAnimationFrame(stepFrame);
        } else {
          rafIdRef.current = null;
          isAnimatingScrollRef.current = false;
          syncScrollProgress();
        }
      };

      rafIdRef.current = window.requestAnimationFrame(stepFrame);
    },
    [cancelRunningAnimation, measureLayout, syncScrollProgress]
  );

  // Stable mount effect: never tears down or re-creates listeners during scroll
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('has-slide-deck');

    measureLayout();
    syncScrollProgress();

    const handleScroll = () => {
      syncScrollProgress();
    };

    const handleResize = () => {
      measureLayout();
      syncScrollProgress();
    };

    const handleUserScrollInterrupt = () => {
      if (isAnimatingScrollRef.current) {
        cancelRunningAnimation();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('wheel', handleUserScrollInterrupt, {
      passive: true,
    });
    window.addEventListener('touchstart', handleUserScrollInterrupt, {
      passive: true,
    });
    window.addEventListener('mousedown', handleUserScrollInterrupt, {
      passive: true,
    });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        measureLayout();
        syncScrollProgress();
      });
      sectionRefs.current.forEach((el) => {
        if (el) resizeObserver?.observe(el);
      });
    }

    return () => {
      root.classList.remove('has-slide-deck');
      cancelRunningAnimation();
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('wheel', handleUserScrollInterrupt);
      window.removeEventListener('touchstart', handleUserScrollInterrupt);
      window.removeEventListener('mousedown', handleUserScrollInterrupt);
      resizeObserver?.disconnect();
    };
  }, [cancelRunningAnimation, measureLayout, syncScrollProgress]);

  // Programmatic navigation when user clicks Header nav links, Hero CTAs, or Right-Edge Dots
  useEffect(() => {
    if (activeSlide !== lastSyncedFromScrollRef.current) {
      lastSyncedFromScrollRef.current = activeSlide;
      animateWindowToSlide(activeSlide);
    }
  }, [activeSlide, animateWindowToSlide]);

  // Sync URL hash on initial load and hashchange
  useEffect(() => {
    const syncFromHash = () => {
      const rawHash = window.location.hash.replace(/^#/, '').trim();
      if (!rawHash) return;
      const foundIndex = slidesRef.current.findIndex((s) => s.id === rawHash);
      if (foundIndex >= 0 && foundIndex !== activeSlideRef.current) {
        lastSyncedFromScrollRef.current = -1;
        onSlideChangeRef.current(foundIndex);
      }
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => {
      window.removeEventListener('hashchange', syncFromHash);
    };
  }, []);

  return (
    <div
      ref={deckRef}
      data-fullpage-deck="true"
      className="relative w-full bg-white"
    >
      {/* Hardware-Composited Sticky Stacking Sections (Scroll-Driven Overlapping Stack) */}
      <div className="relative w-full">
        {slides.map((slide, index) => (
          <section
            key={slide.id}
            id={slide.id}
            ref={(el) => {
              sectionRefs.current[index] = el;
            }}
            aria-label={slide.label}
            data-cover-progress="0.000"
            style={{
              top: '0px',
              zIndex: index + 1,
            }}
            className={`sticky min-h-[100dvh] w-full bg-white pt-14 sm:pt-16 flex flex-col ${
              index > 0 ? 'sticky-stack-card' : ''
            }`}
          >
            <div className="slide-stage-content flex-1 w-full flex flex-col">
              {slide.content}
            </div>

            {/* Lightweight GPU-Composited Depth Veil as Next Section Overlaps */}
            <div
              ref={(el) => {
                veilRefs.current[index] = el;
              }}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[#0a0d14] opacity-0 will-change-[opacity]"
            />
          </section>
        ))}
      </div>

      {/* Right-Edge Minimalist Slide Indicator Rail */}
      <nav
        aria-label="Navigasi slide halaman"
        className="fixed right-3.5 sm:right-6 top-1/2 z-30 -translate-y-1/2 hidden sm:flex flex-col items-end gap-2.5"
      >
        {slides.map((slide, idx) => {
          const isCurrent = idx === activeSlide;
          return (
            <button
              key={slide.id}
              type="button"
              onClick={() => {
                lastSyncedFromScrollRef.current = idx;
                animateWindowToSlide(idx);
                if (idx !== activeSlide) {
                  onSlideChange(idx);
                }
              }}
              aria-label={`Lompat ke slide ${idx + 1}: ${slide.label}`}
              aria-current={isCurrent ? 'step' : undefined}
              className="group flex items-center gap-2.5 py-0.5 pl-2 focus:outline-none"
            >
              <span className="rounded-full bg-[#111315] px-2.5 py-0.5 text-[11px] font-medium text-white shadow-soft opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                {slide.label}
              </span>
              <span
                className={`block rounded-full transition-[height,background-color] duration-300 ${
                  isCurrent
                    ? 'h-6 w-1.5 bg-[#111315]'
                    : 'h-1.5 w-1.5 bg-slate-900/20 group-hover:bg-slate-900/45'
                }`}
              />
            </button>
          );
        })}
      </nav>
    </div>
  );
}
