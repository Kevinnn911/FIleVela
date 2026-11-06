// File: src/components/ThemeToggle.tsx

'use client';

import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'fileflow-theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>('light');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark') {
        document.documentElement.classList.add('dark');
        setTheme('dark');
      } else {
        document.documentElement.classList.remove('dark');
        setTheme('light');
      }
    } catch {
      // Ignore storage access errors in restricted environments
    }
  }, []);

  const handleToggle = () => {
    const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    try {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // Ignore storage write errors in restricted environments
    }
  };

  return (
    <button
      type="button"
      data-testid="theme-toggle-button"
      onClick={handleToggle}
      aria-label={
        theme === 'light'
          ? 'Beralih ke tema gelap (Dark Mode)'
          : 'Beralih ke tema terang (Light Mode)'
      }
      title={
        theme === 'light'
          ? 'Tema saat ini: Light (Klik untuk beralih ke Dark)'
          : 'Tema saat ini: Dark (Klik untuk beralih ke Light)'
      }
      className="btn-ghost-clean min-h-[32px] sm:min-h-[36px] px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs gap-1 sm:gap-1.5 whitespace-nowrap shrink-0"
    >
      {theme === 'light' ? (
        <>
          <Sun className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
          <span>Light</span>
        </>
      ) : (
        <>
          <Moon className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
          <span>Dark</span>
        </>
      )}
    </button>
  );
}
