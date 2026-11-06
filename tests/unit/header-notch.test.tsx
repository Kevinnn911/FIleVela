// File: tests/unit/header-notch.test.tsx

// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Header } from '@/components/Header';
import { SubpageHeader } from '@/components/SubpageHeader';

function setWindowScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    writable: true,
    value,
  });
  Object.defineProperty(window, 'pageYOffset', {
    configurable: true,
    writable: true,
    value,
  });
}

describe('Navbar Floating Notch Scroll, Brand Identity & Theme Toggle Behavior', () => {
  beforeEach(() => {
    setWindowScrollY(0);
    document.documentElement.classList.remove('dark');
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders Header with FileVela brand identity in original full-width state at top and morphs to notch on window scroll, then restores at top', () => {
    render(
      <Header
        activeSlide={0}
        onNavigateSlide={() => {}}
        privacyMode={false}
        onTogglePrivacyMode={() => {}}
      />
    );

    expect(screen.getByText('FileVela')).not.toBeNull();
    const surface = screen.getByTestId('navbar-notch-surface');
    expect(surface.getAttribute('data-scrolled')).toBe('false');

    act(() => {
      setWindowScrollY(120);
      fireEvent.scroll(window);
    });
    expect(surface.getAttribute('data-scrolled')).toBe('true');

    act(() => {
      setWindowScrollY(0);
      fireEvent.scroll(window);
    });
    expect(surface.getAttribute('data-scrolled')).toBe('false');
  });

  it('morphs Header into notch when activeSlide > 0 and restores when returning to slide 0 at top', () => {
    const { rerender } = render(
      <Header activeSlide={0} onNavigateSlide={() => {}} />
    );

    const surface = screen.getByTestId('navbar-notch-surface');
    expect(surface.getAttribute('data-scrolled')).toBe('false');

    rerender(<Header activeSlide={1} onNavigateSlide={() => {}} />);
    expect(surface.getAttribute('data-scrolled')).toBe('true');

    rerender(<Header activeSlide={0} onNavigateSlide={() => {}} />);
    expect(surface.getAttribute('data-scrolled')).toBe('false');
  });

  it('replaces Engine & Format button in Header with a working Light/Dark theme toggle button', () => {
    render(
      <Header
        activeSlide={0}
        onNavigateSlide={() => {}}
        privacyMode={false}
        onTogglePrivacyMode={() => {}}
      />
    );

    expect(screen.queryByText(/Engine/i)).toBeNull();

    const themeBtn = screen.getByTestId('theme-toggle-button');
    expect(themeBtn).not.toBeNull();
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    fireEvent.click(themeBtn);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('fileflow-theme')).toBe('dark');

    fireEvent.click(themeBtn);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem('fileflow-theme')).toBe('light');
  });

  it('renders SubpageHeader with FileVela brand identity and morphs into notch on scroll and restores when scrolled back to top', () => {
    render(<SubpageHeader currentPage="docs" />);

    expect(screen.getByText('FileVela')).not.toBeNull();
    const surface = screen.getByTestId('subpage-notch-surface');
    expect(surface.getAttribute('data-scrolled')).toBe('false');

    act(() => {
      setWindowScrollY(96);
      fireEvent.scroll(window);
    });
    expect(surface.getAttribute('data-scrolled')).toBe('true');

    act(() => {
      setWindowScrollY(0);
      fireEvent.scroll(window);
    });
    expect(surface.getAttribute('data-scrolled')).toBe('false');
  });
});
