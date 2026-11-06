// File: tests/unit/fullpage-slide-deck.test.tsx

// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FullPageSlideDeck, SlideDefinition } from '@/components/FullPageSlideDeck';

const SAMPLE_SLIDES: SlideDefinition[] = [
  { id: 'beranda', label: 'Beranda', content: <div>Konten Beranda</div> },
  { id: 'studio', label: 'Studio', content: <div>Konten Studio</div> },
  { id: 'fitur', label: 'Kapabilitas', content: <div>Konten Kapabilitas</div> },
  { id: 'privasi', label: 'Privasi', content: <div>Konten Privasi</div> },
  { id: 'faq', label: 'FAQ', content: <div>Konten FAQ</div> },
];

function setViewportAndScroll(scrollY: number, innerHeight = 800) {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: innerHeight,
  });
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    writable: true,
    value: scrollY,
  });
  Object.defineProperty(window, 'pageYOffset', {
    configurable: true,
    writable: true,
    value: scrollY,
  });
}

function DeckHarness() {
  const [activeSlide, setActiveSlide] = useState(0);
  return (
    <div>
      <FullPageSlideDeck
        slides={SAMPLE_SLIDES}
        activeSlide={activeSlide}
        onSlideChange={setActiveSlide}
      />
      <output data-testid="active-slide">{activeSlide}</output>
    </div>
  );
}

describe('Sticky Stacking Sections (Scroll-Driven Overlapping Sections)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.scrollTo = vi.fn();
    window.history.replaceState(null, '', '/');
    setViewportAndScroll(0, 800);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders all sections with position: sticky and ascending z-index so each section overlaps the previous one', () => {
    const { container } = render(<DeckHarness />);
    const sections = Array.from(container.querySelectorAll('section'));
    expect(sections).toHaveLength(5);

    sections.forEach((sec, idx) => {
      expect(sec.className).toContain('sticky');
      expect(sec.className).toContain('min-h-[100dvh]');
      expect(sec.style.zIndex).toBe(String(idx + 1));
    });
  });

  it('shows Section 1 filling the viewport on initial open with zero cover progress', () => {
    const { container } = render(<DeckHarness />);
    const sections = Array.from(container.querySelectorAll('section'));

    expect(screen.getByTestId('active-slide').textContent).toBe('0');
    expect(sections[0]?.getAttribute('data-cover-progress')).toBe('0.000');
  });

  it('tracks continuous scroll-driven overlap progress as Section 2 rises over Section 1 (no auto-jump on wheel)', () => {
    const { container } = render(<DeckHarness />);
    const sections = Array.from(container.querySelectorAll('section'));

    // Wheel event alone must not hijack or auto-jump slides without scroll position change
    const wheelEvent = new WheelEvent('wheel', {
      deltaY: 120,
      bubbles: true,
      cancelable: true,
    });
    const notCancelled = window.dispatchEvent(wheelEvent);
    expect(notCancelled).toBe(true);
    expect(screen.getByTestId('active-slide').textContent).toBe('0');

    // Scroll 25% of viewport height (200px / 800px): Section 2 covers 25% of Section 1
    act(() => {
      setViewportAndScroll(200, 800);
      fireEvent.scroll(window);
    });
    expect(sections[0]?.getAttribute('data-cover-progress')).toBe('0.250');
    expect(screen.getByTestId('active-slide').textContent).toBe('0');

    // Scroll 50% of viewport height (400px / 800px): Section 2 covers 50% of Section 1
    act(() => {
      setViewportAndScroll(400, 800);
      fireEvent.scroll(window);
    });
    expect(sections[0]?.getAttribute('data-cover-progress')).toBe('0.500');
    expect(screen.getByTestId('active-slide').textContent).toBe('1');

    // Scroll 75% of viewport height (600px / 800px): Section 1 still 25% visible behind Section 2
    act(() => {
      setViewportAndScroll(600, 800);
      fireEvent.scroll(window);
    });
    expect(sections[0]?.getAttribute('data-cover-progress')).toBe('0.750');

    // Scroll 100% of viewport height (800px / 800px): Section 1 completely covered by Section 2
    act(() => {
      setViewportAndScroll(800, 800);
      fireEvent.scroll(window);
    });
    expect(sections[0]?.getAttribute('data-cover-progress')).toBe('1.000');
    expect(sections[1]?.getAttribute('data-cover-progress')).toBe('0.000');
  });

  it('applies the same scroll-driven overlap to all subsequent sections and reverses smoothly when scrolling up', () => {
    const { container } = render(<DeckHarness />);
    const sections = Array.from(container.querySelectorAll('section'));

    // Scroll to midpoint between Section 2 and Section 3 (1200px)
    act(() => {
      setViewportAndScroll(1200, 800);
      fireEvent.scroll(window);
    });
    expect(sections[0]?.getAttribute('data-cover-progress')).toBe('1.000');
    expect(sections[1]?.getAttribute('data-cover-progress')).toBe('0.500');
    expect(screen.getByTestId('active-slide').textContent).toBe('2');

    // Scroll to Section 5 (3200px)
    act(() => {
      setViewportAndScroll(3200, 800);
      fireEvent.scroll(window);
    });
    expect(sections[3]?.getAttribute('data-cover-progress')).toBe('1.000');
    expect(sections[4]?.getAttribute('data-cover-progress')).toBe('0.000');
    expect(screen.getByTestId('active-slide').textContent).toBe('4');

    // Reverse scroll back up to 2800px -> Section 4 re-emerges to 50%
    act(() => {
      setViewportAndScroll(2800, 800);
      fireEvent.scroll(window);
    });
    expect(sections[3]?.getAttribute('data-cover-progress')).toBe('0.500');

    // Reverse scroll back to top (0px) -> Section 1 fully uncovered again
    act(() => {
      setViewportAndScroll(0, 800);
      fireEvent.scroll(window);
    });
    expect(sections[0]?.getAttribute('data-cover-progress')).toBe('0.000');
    expect(screen.getByTestId('active-slide').textContent).toBe('0');
  });

  it('hides the visual browser scrollbar in globals.css without locking overflow-y', () => {
    const cssPath = path.resolve(process.cwd(), 'src/app/globals.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toContain('scrollbar-width: none;');
    expect(css).toContain('html::-webkit-scrollbar');
    expect(css).not.toMatch(/overflow-y\s*:\s*hidden/);
  });
});
