// File: tailwind.config.ts

import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'var(--font-onest)',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        display: [
          'var(--font-onest)',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        brand: [
          'var(--font-onest)',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        mono: [
          'var(--font-jetbrains-mono)',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      colors: {
        canvas: 'var(--canvas)',
        porcelain: 'var(--porcelain)',
        'porcelain-strong': 'var(--porcelain-hover)',
        ink: 'var(--ink)',
        'ink-muted': 'var(--ink-secondary)',
        'ink-subtle': 'var(--ink-tertiary)',
        accent: 'var(--accent-blue)',
        border: 'var(--line)',
        'border-strong': 'var(--line-strong)',
        foreground: 'var(--ink)',
      },
      boxShadow: {
        soft: '0 14px 36px -16px rgba(15, 23, 42, 0.07), 0 2px 8px -2px rgba(15, 23, 42, 0.04)',
        float:
          '0 24px 60px -20px rgba(15, 23, 42, 0.11), 0 4px 14px -4px rgba(15, 23, 42, 0.05)',
        glass:
          '0 24px 56px -18px rgba(15, 36, 74, 0.14), 0 4px 12px -4px rgba(15, 36, 74, 0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
