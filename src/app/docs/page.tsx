// File: src/app/docs/page.tsx

import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SubpageHeader } from '@/components/SubpageHeader';
import { Footer } from '@/components/Footer';
import { ArrowUpRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Dokumentasi & Spesifikasi API | FileVela',
  description:
    'Panduan teknis arsitektur pemrosesan berkas, matriks 35+ format adapter runtime, mode privasi memori browser, dan spesifikasi endpoint API terisolasi FileVela.',
};

const ENGINE_MATRIX = [
  {
    category: 'Citra Raster & Vektor',
    formats: 'PNG, JPG, WebP, AVIF, GIF, TIFF, BMP, ICO, SVG',
    engine: 'Sharp / libvips, Custom BMP-ICO Codec & PDF-Lib',
    capabilities:
      'Transcoding warna, ekstraksi frame terbaik ICO, citra ke PDF, CIE-Lab alpha matting',
  },
  {
    category: 'Dokumen Office & PDF',
    formats: 'PDF, DOCX, ODT, RTF, PPTX, XLSX, HTML, MD, TXT',
    engine: 'OpenXML/ODF Native Builder, PDF-Lib & LibreOffice (opsional)',
    capabilities:
      'Pembangunan DOCX/XLSX murni, ekstraksi FlateDecode PDF, merge 60 PDF & split halaman',
  },
  {
    category: 'Audio & Gelombang Suara',
    formats: 'MP3, WAV, AAC, FLAC, OGG, M4A',
    engine: 'FFmpeg Core (libmp3lame, libopus, flac, aac)',
    capabilities:
      'Transcoding & kompresi bitrate terukur, deteksi stream hening via ffprobe',
  },
  {
    category: 'Video & Stream Publik',
    formats: 'MP4, WebM, MOV, MKV, AVI',
    engine: 'FFmpeg Core (H.264 yuv420p, VP9) & Stream Extractor',
    capabilities:
      'Kompresi CRF terukur, penskalaan dimensi genap otomatis, remuxing tanpa watermark',
  },
  {
    category: 'Data Terstruktur',
    formats: 'JSON, CSV, TSV, XML, YAML',
    engine: 'RFC 4180 Tabular & Schema Parser (Server & Lokal)',
    capabilities:
      'Dukungan multiline ber-kutip, XML beratribut/CDATA, YAML bersarang, ekspor ke XLSX/PDF',
  },
];

const API_ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/capabilities',
    auth: 'Publik',
    description:
      'Mengembalikan katalog 35+ format sumber beserta status ketersediaan setiap adapter runtime aktif. Mendukung kueri ?source=ext untuk daftar target spesifik.',
  },
  {
    method: 'POST',
    path: '/api/jobs',
    auth: 'Menerbitkan ownerToken',
    description:
      'Menerima unggahan multipart/form-data (file, targetFormat, options), memverifikasi signature magic-bytes, mengeksekusi adapter konversi, dan mengembalikan HTTP 201 (atau 422 bila eksekusi gagal).',
  },
  {
    method: 'POST',
    path: '/api/compress',
    auth: 'Menerbitkan ownerToken',
    description:
      'Menjalankan kompresi ukuran berkas pada gambar, PDF (termasuk rekompresi citra tertanam), bundel Office, teks, serta video/audio FFmpeg berdasarkan profil low, recommended, atau extreme.',
  },
  {
    method: 'POST',
    path: '/api/background-removal',
    auth: 'Menerbitkan ownerToken',
    description:
      'Memisahkan subjek citra hingga 50 MB menggunakan flood-fill CIE-Lab berbatas gradien Sobel ke PNG transparan, warna pas foto resmi, atau latar gradasi studio.',
  },
  {
    method: 'POST',
    path: '/api/pdf/merge & /api/pdf/split',
    auth: 'Menerbitkan ownerToken',
    description:
      'Menggabungkan 2 hingga 60 dokumen PDF secara berurutan (maks 250 MB total) atau memisahkan halaman spesifik dari PDF tidak terenkripsi.',
  },
  {
    method: 'POST',
    path: '/api/jobs/batch-zip',
    auth: 'Verifikasi token per jobId',
    description:
      'Mengarsipkan sekumpulan hasil pekerjaan server yang belum kedaluwarsa ke dalam berkas ZIP ber-flag UTF-8 (0x0800) dengan bypass kompresi otomatis pada media padat.',
  },
  {
    method: 'GET / DELETE',
    path: '/api/jobs/[id] & /api/jobs/[id]/download',
    auth: 'Token Sesi (Header / Query)',
    description:
      'Mengunduh hasil dengan header RFC 5987 Content-Disposition yang aman bagi karakter Unicode, mengembalikan HTTP 410 bila melewati TTL 60 menit, atau memusnahkan job secara instan.',
  },
];

export default function DocsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-[#0a0d14]">
      <SubpageHeader currentPage="docs" />

      <main className="flex-1 py-10 sm:py-16">
        <div className="mx-auto max-w-[1080px] px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12">
            {/* Left Sticky Specification & TOC Rail */}
            <aside className="lg:col-span-4">
              <div className="lg:sticky lg:top-24 space-y-6">
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-[#0a0d14]">
                    Daftar Bagian Dokumentasi
                  </p>
                  <nav
                    aria-label="Daftar bagian dokumentasi"
                    className="flex flex-col gap-1 border-l border-slate-900/10 pl-3 text-sm"
                  >
                    <a
                      href="#arsitektur"
                      className="rounded-lg px-2.5 py-1.5 text-[#4e5666] hover:bg-[#f6f8fb] hover:text-[#0a0d14] transition-colors"
                    >
                      Arsitektur Eksekusi Ganda
                    </a>
                    <a
                      href="#modul"
                      className="rounded-lg px-2.5 py-1.5 text-[#4e5666] hover:bg-[#f6f8fb] hover:text-[#0a0d14] transition-colors"
                    >
                      Modul Stasiun Kerja
                    </a>
                    <a
                      href="#matriks"
                      className="rounded-lg px-2.5 py-1.5 text-[#4e5666] hover:bg-[#f6f8fb] hover:text-[#0a0d14] transition-colors"
                    >
                      Matriks Engine &amp; Format
                    </a>
                    <a
                      href="#api"
                      className="rounded-lg px-2.5 py-1.5 text-[#4e5666] hover:bg-[#f6f8fb] hover:text-[#0a0d14] transition-colors"
                    >
                      Kontrak Endpoint REST API
                    </a>
                  </nav>
                </div>

                <div className="surface-porcelain divide-y divide-slate-900/[0.07] text-xs overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[#4e5666]">Versi Spesifikasi</span>
                    <span className="font-mono font-semibold text-[#0a0d14]">
                      v2.0.0
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[#4e5666]">Kuota Maksimum</span>
                    <span className="font-mono font-semibold text-[#0a0d14]">
                      50 MB / berkas
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[#4e5666]">Kapasitas Gabung PDF</span>
                    <span className="font-mono font-semibold text-[#0a0d14]">
                      Hingga 60 PDF
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[#4e5666]">Retensi Sandbox</span>
                    <span className="font-mono font-semibold text-[#0a0d14]">
                      60 menit (TTL)
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[#4e5666]">Otorisasi Job</span>
                    <span className="font-mono font-semibold text-[#1d4ed8]">
                      HMAC / SHA-256
                    </span>
                  </div>
                </div>
              </div>
            </aside>

            {/* Right Editorial & Technical Content */}
            <article className="lg:col-span-8 space-y-12">
              <header className="space-y-3 max-w-[68ch]">
                <p className="text-xs font-medium text-[#2563eb]">
                  Spesifikasi Rekayasa &amp; API
                </p>
                <h1 className="font-brand text-3xl sm:text-4xl font-semibold tracking-[-0.032em] text-[#0a0d14]">
                  Dokumentasi Arsitektur FileVela
                </h1>
                <p className="text-base text-[#4e5666] leading-relaxed">
                  Spesifikasi menyeluruh mengenai prinsip verifikasi biner,
                  pemisahan eksekusi lokal versus sandbox server efemeral,
                  matriks kompatibilitas 35+ format, serta kontrak API internal.
                </p>
              </header>

              <section
                id="arsitektur"
                className="scroll-mt-24 border-t border-slate-900/10 pt-9 space-y-4 max-w-[68ch]"
              >
                <h2 className="font-brand text-xl sm:text-2xl font-semibold tracking-[-0.025em] text-[#0a0d14]">
                  Arsitektur Eksekusi Ganda &amp; Prinsip Anti-Deception
                </h2>
                <p className="text-sm sm:text-[15px] leading-7 text-[#4e5666]">
                  FileVela dibangun di atas aturan ketat tanpa konversi palsu
                  (zero extension spoofing). Setiap berkas yang masuk diperiksa
                  tanda tangan biner (magic-bytes) dan struktur arsip ZIP/XML
                  sebelum dipetakan ke adapter konverter yang aktif. Format
                  biner lawas OLE2 (.doc, .ppt, .xls) tanpa LibreOffice akan
                  ditolak secara jujur ketimbang menghasilkan berkas rusak.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="surface-porcelain p-5 space-y-2">
                    <h3 className="text-sm font-semibold text-[#0a0d14]">
                      1. Sandbox Server Terisolasi
                    </h3>
                    <p className="text-xs sm:text-[13px] leading-relaxed text-[#4e5666]">
                      Menangani transcoding berat (pembangunan OpenXML
                      DOCX/XLSX, ekstraksi FlateDecode PDF, media FFmpeg, dan
                      kuantisasi Sharp) di direktori sementara per-job yang
                      dilindungi hash SHA-256 dan dibersihkan otomatis setelah
                      60 menit.
                    </p>
                  </div>

                  <div className="surface-porcelain p-5 space-y-2">
                    <h3 className="text-sm font-semibold text-[#0a0d14]">
                      2. Mode Privasi Lokal (Browser)
                    </h3>
                    <p className="text-xs sm:text-[13px] leading-relaxed text-[#4e5666]">
                      Saat diaktifkan dari bilah navigasi, konversi maupun
                      kompresi gambar raster (PNG, JPG, WebP, SVG) dan data
                      tabular (JSON, CSV, TSV, TXT) beserta pengemasan antrian
                      batch .ZIP dieksekusi 100% di memori peramban.
                    </p>
                  </div>
                </div>
              </section>

              <section
                id="modul"
                className="scroll-mt-24 border-t border-slate-900/10 pt-9 space-y-5 max-w-[68ch]"
              >
                <h2 className="font-brand text-xl sm:text-2xl font-semibold tracking-[-0.025em] text-[#0a0d14]">
                  Modul Stasiun Kerja Utama
                </h2>

                <div className="divide-y divide-slate-900/10 border-y border-slate-900/10">
                  <div className="py-4 space-y-1">
                    <h3 className="text-sm font-semibold text-[#0a0d14]">
                      Antrian Batch Multi-Berkas (.ZIP) di Tiga Modul
                    </h3>
                    <p className="text-sm leading-relaxed text-[#4e5666]">
                      Modul Konversi, Kompres, dan Hapus BG ketiganya mendukung
                      pemrosesan puluhan berkas sekaligus (konkurensi 3 worker)
                      lengkap dengan pengunduhan arsip .ZIP satu klik dan tombol
                      pemusnahan massal dari server.
                    </p>
                  </div>

                  <div className="py-4 space-y-1">
                    <h3 className="text-sm font-semibold text-[#0a0d14]">
                      Kompresi Gambar, PDF, Office &amp; Media FFmpeg
                    </h3>
                    <p className="text-sm leading-relaxed text-[#4e5666]">
                      Menyediakan profil Ringan, Seimbang, dan Maksimal yang
                      merekompresi citra tertanam di dalam PDF/DOCX/PPTX/XLSX
                      serta menjalankan transcoding CRF/bitrate FFmpeg pada MP4,
                      WebM, MP3, WAV, OGG, FLAC, M4A, dan AAC.
                    </p>
                  </div>

                  <div className="py-4 space-y-1">
                    <h3 className="text-sm font-semibold text-[#0a0d14]">
                      Isolasi Latar Belakang CIE-Lab &amp; Tepi Sobel
                    </h3>
                    <p className="text-sm leading-relaxed text-[#4e5666]">
                      Mengekstrak subjek gambar ke latar transparan PNG, warna
                      standar dokumen resmi Indonesia (Merah KTP #DC2626, Biru
                      Paspor #1E40AF), atau latar gradasi studio tanpa melubangi
                      pakaian putih di bagian tengah subjek.
                    </p>
                  </div>

                  <div className="py-4 space-y-1">
                    <h3 className="text-sm font-semibold text-[#0a0d14]">
                      Pengelola Struktur PDF &amp; Ekstraksi Stream Publik
                    </h3>
                    <p className="text-sm leading-relaxed text-[#4e5666]">
                      Penggabungan urutan hingga 60 dokumen PDF dan pemisahan
                      rentang halaman dengan deteksi PDF terenkripsi otomatis,
                      serta ekstraksi aliran MP4/MP3 dari tautan publik dengan
                      perlindungan SSRF penuh.
                    </p>
                  </div>
                </div>
              </section>

              <section
                id="matriks"
                className="scroll-mt-24 border-t border-slate-900/10 pt-9 space-y-4"
              >
                <div className="space-y-1 max-w-[68ch]">
                  <h2 className="font-brand text-xl sm:text-2xl font-semibold tracking-[-0.025em] text-[#0a0d14]">
                    Matriks Engine &amp; Format Terdaftar
                  </h2>
                  <p className="text-sm text-[#4e5666]">
                    Daftar mesin pemrosesan beserta cakupan ekstensi yang
                    diverifikasi oleh registry runtime FileVela.
                  </p>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-900/10 bg-white shadow-soft">
                  <table className="w-full text-left text-xs sm:text-[13px]">
                    <thead className="border-b border-slate-900/10 bg-[#f6f8fb] font-mono text-[11px] text-[#4e5666]">
                      <tr>
                        <th className="py-3.5 px-4 font-semibold">Kategori</th>
                        <th className="py-3.5 px-4 font-semibold">Ekstensi</th>
                        <th className="py-3.5 px-4 font-semibold">Engine</th>
                        <th className="py-3.5 px-4 font-semibold">
                          Kapabilitas
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/[0.07] text-[#4e5666]">
                      {ENGINE_MATRIX.map((row) => (
                        <tr key={row.category}>
                          <td className="py-3.5 px-4 font-semibold text-[#0a0d14] whitespace-nowrap">
                            {row.category}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs text-[#0a0d14]">
                            {row.formats}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {row.engine}
                          </td>
                          <td className="py-3.5 px-4">{row.capabilities}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section
                id="api"
                className="scroll-mt-24 border-t border-slate-900/10 pt-9 space-y-4"
              >
                <div className="space-y-1 max-w-[68ch]">
                  <h2 className="font-brand text-xl sm:text-2xl font-semibold tracking-[-0.025em] text-[#0a0d14]">
                    Kontrak Endpoint REST API Internal
                  </h2>
                  <p className="text-sm text-[#4e5666]">
                    Seluruh rute mengimplementasikan otorisasi berbasis token
                    kepemilikan sehingga tidak ada berkas yang dapat diakses
                    hanya dengan menebak UUID job.
                  </p>
                </div>

                <div className="divide-y divide-slate-900/[0.07] rounded-2xl border border-slate-900/10 bg-[#f6f8fb] overflow-hidden">
                  {API_ENDPOINTS.map((ep) => (
                    <div key={ep.path} className="p-4 sm:p-5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="rounded-full border border-slate-900/10 bg-[#111315] px-2.5 py-0.5 font-mono text-[11px] font-bold text-white">
                            {ep.method}
                          </span>
                          <code className="font-mono text-xs sm:text-[13px] font-semibold text-[#0a0d14]">
                            {ep.path}
                          </code>
                        </div>
                        <span className="font-mono text-[11px] text-[#4e5666]">
                          Otorisasi: {ep.auth}
                        </span>
                      </div>
                      <p className="text-xs sm:text-[13px] leading-relaxed text-[#4e5666] max-w-[68ch]">
                        {ep.description}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="pt-4">
                  <Link
                    href="/#studio"
                    className="btn-primary-dark text-xs sm:text-[13px]"
                  >
                    <span>Kembali ke Panggung Kerja FileVela</span>
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </section>
            </article>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
