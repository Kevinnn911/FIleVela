// File: src/app/layout.tsx

import type { Metadata } from 'next';
import { JetBrains_Mono, Onest } from 'next/font/google';
import { SITE_NAME, SITE_URL } from '@/lib/config/site';
import './globals.css';

const onest = Onest({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-onest',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

const DEFAULT_TITLE =
  'FileVela | Stasiun Kerja Konversi, Kompresi & Media Presisi';
const DEFAULT_DESCRIPTION =
  'Stasiun kerja pemrosesan berkas universal FileVela: konversi 35+ format asli, kompresi dokumen & media FFmpeg, isolasi latar belakang pas foto, pengelola PDF 60 berkas, dan ekstraksi stream publik.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: 'summary',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '64x64' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={`${onest.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-white text-[#0a0d14] font-sans antialiased selection:bg-[#0a0d14] selection:text-white">
        {children}
      </body>
    </html>
  );
}
