// File: src/app/privacy/page.tsx

import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SubpageHeader } from '@/components/SubpageHeader';
import { Footer } from '@/components/Footer';
import { ArrowUpRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Kebijakan Privasi & Keamanan Data | FileVela',
  description:
    'Komitmen perlindungan data FileVela: penyimpanan sandbox efemeral 60 menit dengan penyapu otomatis, verifikasi token SHA-256, dan Mode Privasi Lokal tanpa unggahan server.',
};

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-[#0a0d14]">
      <SubpageHeader currentPage="privacy" />

      <main className="flex-1 py-10 sm:py-16">
        <div className="mx-auto max-w-[1080px] px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12">
            {/* Left Sticky Summary & TOC Rail */}
            <aside className="lg:col-span-4">
              <div className="lg:sticky lg:top-24 space-y-6">
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-[#0a0d14]">
                    Pasal Kebijakan Privasi
                  </p>
                  <nav
                    aria-label="Navigasi pasal kebijakan privasi"
                    className="flex flex-col gap-1 border-l border-slate-900/10 pl-3 text-sm"
                  >
                    <a
                      href="#pengumpulan-data"
                      className="rounded-lg px-2.5 py-1.5 text-[#4e5666] hover:bg-[#f6f8fb] hover:text-[#0a0d14] transition-colors"
                    >
                      Minimisasi Pengumpulan Data
                    </a>
                    <a
                      href="#siklus-ephemeral"
                      className="rounded-lg px-2.5 py-1.5 text-[#4e5666] hover:bg-[#f6f8fb] hover:text-[#0a0d14] transition-colors"
                    >
                      Siklus Hidup &amp; Penghapusan
                    </a>
                    <a
                      href="#privasi-lokal"
                      className="rounded-lg px-2.5 py-1.5 text-[#4e5666] hover:bg-[#f6f8fb] hover:text-[#0a0d14] transition-colors"
                    >
                      Mode Privasi Lokal (Browser)
                    </a>
                    <a
                      href="#pihak-ketiga"
                      className="rounded-lg px-2.5 py-1.5 text-[#4e5666] hover:bg-[#f6f8fb] hover:text-[#0a0d14] transition-colors"
                    >
                      Kemandirian Pemrosesan
                    </a>
                  </nav>
                </div>

                <div className="surface-porcelain divide-y divide-slate-900/[0.07] text-xs overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[#4e5666]">Status Efektif</span>
                    <span className="font-mono font-semibold text-[#0a0d14]">
                      2 Nov 2026
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[#4e5666]">Kewajiban Akun</span>
                    <span className="font-mono font-semibold text-[#0a0d14]">
                      Tanpa Akun
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[#4e5666]">Batas Simpan Server</span>
                    <span className="font-mono font-semibold text-[#0a0d14]">
                      Maks. 60 Menit
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[#4e5666]">Pelatihan AI Eksternal</span>
                    <span className="font-mono font-semibold text-[#1d4ed8]">
                      Tidak Pernah
                    </span>
                  </div>
                </div>
              </div>
            </aside>

            {/* Right Editorial Policy Prose */}
            <article className="lg:col-span-8 space-y-10 max-w-[68ch]">
              <header className="space-y-3">
                <p className="text-xs font-medium text-[#2563eb]">
                  Perlindungan Data &amp; Privasi
                </p>
                <h1 className="font-brand text-3xl sm:text-4xl font-semibold tracking-[-0.032em] text-[#0a0d14]">
                  Kebijakan Privasi FileVela
                </h1>
                <p className="text-base text-[#4e5666] leading-relaxed">
                  FileVela dirancang sebagai instrumen pemrosesan tanpa jejak
                  permanen. Berkas Anda tetap menjadi milik Anda sepenuhnya,
                  tidak pernah diindeks untuk pembuatan profil iklan, dan tidak
                  disimpan melampaui jendela teknis pengunduhan.
                </p>
              </header>

              <section
                id="pengumpulan-data"
                className="scroll-mt-24 border-t border-slate-900/10 pt-8 space-y-3"
              >
                <h2 className="font-brand text-xl font-semibold tracking-[-0.025em] text-[#0a0d14]">
                  Minimisasi Pengumpulan Informasi
                </h2>
                <p className="text-sm sm:text-[15px] leading-7 text-[#4e5666]">
                  Seluruh kapabilitas FileVela dapat dijalankan tanpa
                  pendaftaran akun, alamat surel, maupun nomor telepon. Kami
                  menerapkan prinsip minimisasi data ketat pada setiap tahapan
                  transaksi:
                </p>
                <ul className="space-y-2.5 pt-1 text-sm sm:text-[15px] leading-7 text-[#4e5666] list-disc pl-5">
                  <li>
                    <strong className="font-semibold text-[#0a0d14]">
                      Substansi Berkas:
                    </strong>{' '}
                    Isi berkas yang diunggah ke mode server semata-mata dibaca
                    oleh proses transcoding di direktori kerja terisolasi dan
                    tidak pernah dibuka secara manual.
                  </li>
                  <li>
                    <strong className="font-semibold text-[#0a0d14]">
                      Identitas Pribadi (PII):
                    </strong>{' '}
                    Sistem tidak mengekstrak informasi identitas pribadi atau
                    menyimpan alamat IP pengguna ke dalam metadata pekerjaan.
                  </li>
                  <li>
                    <strong className="font-semibold text-[#0a0d14]">
                      Log Operasional:
                    </strong>{' '}
                    Telemetri internal hanya memantau status keberhasilan
                    adapter dan durasi pemrosesan tanpa mencatat isi dokumen
                    sensitif.
                  </li>
                </ul>
              </section>

              <section
                id="siklus-ephemeral"
                className="scroll-mt-24 border-t border-slate-900/10 pt-8 space-y-4"
              >
                <h2 className="font-brand text-xl font-semibold tracking-[-0.025em] text-[#0a0d14]">
                  Siklus Hidup &amp; Pemusnahan Berkas Ephemeral
                </h2>
                <p className="text-sm sm:text-[15px] leading-7 text-[#4e5666]">
                  Setiap pekerjaan server ditempatkan pada ruang direktori
                  ber-UUID acak dan dikunci dengan hash token kepemilikan
                  SHA-256 sepanjang 256-bit. Server hanya menyimpan nilai hash
                  kriptografis, sementara token asli hanya dipegang oleh sesi
                  peramban Anda.
                </p>

                <div className="surface-porcelain divide-y divide-slate-900/[0.07] text-xs sm:text-[13px] overflow-hidden">
                  <div className="px-4 py-3.5 flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span className="font-semibold text-[#0a0d14]">
                      Batas Waktu Retensi (TTL) &amp; HTTP 410
                    </span>
                    <span className="font-mono text-[#4e5666]">
                      3.600 detik (60 menit), penyapu otomatis menghapus job kedaluwarsa
                    </span>
                  </div>
                  <div className="px-4 py-3.5 flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span className="font-semibold text-[#0a0d14]">
                      Pemusnahan Instan Pengguna
                    </span>
                    <span className="font-mono text-[#4e5666]">
                      Tombol hapus di panel hasil &amp; batch memicu unlink rekursif seketika
                    </span>
                  </div>
                  <div className="px-4 py-3.5 flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span className="font-semibold text-[#0a0d14]">
                      Cakupan Pembersihan
                    </span>
                    <span className="font-mono text-[#4e5666]">
                      Berkas sumber, hasil konversi, direktori sementara, dan meta.json
                    </span>
                  </div>
                </div>
              </section>

              <section
                id="privasi-lokal"
                className="scroll-mt-24 border-t border-slate-900/10 pt-8 space-y-3"
              >
                <h2 className="font-brand text-xl font-semibold tracking-[-0.025em] text-[#0a0d14]">
                  Mode Privasi Lokal (Eksekusi Memori Browser)
                </h2>
                <p className="text-sm sm:text-[15px] leading-7 text-[#4e5666]">
                  Untuk dokumen internal yang tidak boleh meninggalkan perangkat
                  sama sekali, aktifkan tombol{' '}
                  <strong className="font-semibold text-[#0a0d14]">
                    Mode Privasi
                  </strong>{' '}
                  pada bilah navigasi utama. Dalam kondisi terkunci, FileVela
                  menjalankan konversi maupun kompresi gambar raster dan data
                  tabular (baik berkas tunggal maupun pengemasan arsip .ZIP
                  batch) murni menggunakan HTML5 Canvas dan memori lokal
                  peramban. Sistem juga secara tegas menahan pengiriman ke modul
                  yang membutuhkan server hingga Anda sendiri yang memberikan
                  izin.
                </p>
              </section>

              <section
                id="pihak-ketiga"
                className="scroll-mt-24 border-t border-slate-900/10 pt-8 space-y-3"
              >
                <h2 className="font-brand text-xl font-semibold tracking-[-0.025em] text-[#0a0d14]">
                  Kemandirian Pemrosesan &amp; Larangan Akses Pihak Ketiga
                </h2>
                <p className="text-sm sm:text-[15px] leading-7 text-[#4e5666]">
                  FileVela tidak menggunakan skrip pelacak periklanan lintas
                  situs, tidak menjual metadata kepada pialang data, dan tidak
                  pernah menyerahkan berkas unggahan pengguna sebagai korpus
                  pelatihan model kecerdasan buatan pihak ketiga.
                </p>

                <div className="pt-4">
                  <Link
                    href="/terms"
                    className="btn-secondary-light text-xs sm:text-[13px]"
                  >
                    <span>Baca Syarat &amp; Ketentuan Layanan</span>
                    <ArrowUpRight className="h-4 w-4 text-[#2563eb]" />
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
