// File: src/app/terms/page.tsx

import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SubpageHeader } from '@/components/SubpageHeader';
import { Footer } from '@/components/Footer';
import { ArrowUpRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Syarat & Ketentuan Layanan | FileVela',
  description:
    'Ketentuan penggunaan layanan FileVela: batas ukuran berkas 50 MB, penggabungan hingga 60 PDF, kebijakan penggunaan wajar, dan batasan tanggung jawab.',
};

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-[#0a0d14]">
      <SubpageHeader currentPage="terms" />

      <main className="flex-1 py-10 sm:py-16">
        <div className="mx-auto max-w-[1080px] px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12">
            {/* Left Sticky Navigation & Operational Limits Rail */}
            <aside className="lg:col-span-4">
              <div className="lg:sticky lg:top-24 space-y-6">
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold text-[#0a0d14]">
                    Bagian Ketentuan Layanan
                  </p>
                  <nav
                    aria-label="Navigasi pasal syarat dan ketentuan"
                    className="flex flex-col gap-1 border-l border-slate-900/10 pl-3 text-sm"
                  >
                    <a
                      href="#cakupan"
                      className="rounded-lg px-2.5 py-1.5 text-[#4e5666] hover:bg-[#f6f8fb] hover:text-[#0a0d14] transition-colors"
                    >
                      Cakupan &amp; Kejujuran Layanan
                    </a>
                    <a
                      href="#penggunaan-wajar"
                      className="rounded-lg px-2.5 py-1.5 text-[#4e5666] hover:bg-[#f6f8fb] hover:text-[#0a0d14] transition-colors"
                    >
                      Kebijakan Penggunaan Wajar
                    </a>
                    <a
                      href="#hak-cipta-media"
                      className="rounded-lg px-2.5 py-1.5 text-[#4e5666] hover:bg-[#f6f8fb] hover:text-[#0a0d14] transition-colors"
                    >
                      Ekstraksi Media &amp; Hak Cipta
                    </a>
                    <a
                      href="#batasan-tanggung-jawab"
                      className="rounded-lg px-2.5 py-1.5 text-[#4e5666] hover:bg-[#f6f8fb] hover:text-[#0a0d14] transition-colors"
                    >
                      Batasan Tanggung Jawab
                    </a>
                  </nav>
                </div>

                <div className="surface-porcelain divide-y divide-slate-900/[0.07] text-xs overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[#4e5666]">Tanggal Berlaku</span>
                    <span className="font-mono font-semibold text-[#0a0d14]">
                      2 Nov 2026
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[#4e5666]">Batas Ukuran Berkas</span>
                    <span className="font-mono font-semibold text-[#0a0d14]">
                      50 MB / berkas
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[#4e5666]">Batas Gabung PDF</span>
                    <span className="font-mono font-semibold text-[#0a0d14]">
                      60 dokumen (250 MB)
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[#4e5666]">Sifat Penyimpanan</span>
                    <span className="font-mono font-semibold text-[#1d4ed8]">
                      Sementara (Non-Cloud)
                    </span>
                  </div>
                </div>
              </div>
            </aside>

            {/* Right Editorial Terms Prose */}
            <article className="lg:col-span-8 space-y-10 max-w-[68ch]">
              <header className="space-y-3">
                <p className="text-xs font-medium text-[#2563eb]">
                  Ketentuan Operasional
                </p>
                <h1 className="font-brand text-3xl sm:text-4xl font-semibold tracking-[-0.032em] text-[#0a0d14]">
                  Syarat &amp; Ketentuan Layanan
                </h1>
                <p className="text-base text-[#4e5666] leading-relaxed">
                  Ketentuan ini mengatur penggunaan seluruh modul stasiun kerja
                  FileVela, termasuk konversi format berkas, kompresi multi-lapis,
                  isolasi latar belakang gambar, manipulasi struktur PDF, dan
                  ekstraksi media publik.
                </p>
              </header>

              <section
                id="cakupan"
                className="scroll-mt-24 border-t border-slate-900/10 pt-8 space-y-3"
              >
                <h2 className="font-brand text-xl font-semibold tracking-[-0.025em] text-[#0a0d14]">
                  Cakupan &amp; Kejujuran Kapabilitas Layanan
                </h2>
                <p className="text-sm sm:text-[15px] leading-7 text-[#4e5666]">
                  Dengan mengakses antarmuka web atau endpoint API FileVela,
                  Anda menyetujui ketentuan operasional yang ditetapkan pada
                  dokumen ini. FileVela hanya menawarkan pasangan konversi dan
                  kompresi yang didukung oleh engine terverifikasi pada runtime
                  aktif serta tidak pernah melakukan penggantian ekstensi semu.
                  Apabila suatu format memerlukan pustaka eksternal yang sedang
                  tidak tersedia, layanan memberikan pemberitahuan penolakan
                  yang jujur.
                </p>
              </section>

              <section
                id="penggunaan-wajar"
                className="scroll-mt-24 border-t border-slate-900/10 pt-8 space-y-3"
              >
                <h2 className="font-brand text-xl font-semibold tracking-[-0.025em] text-[#0a0d14]">
                  Kebijakan Penggunaan yang Diizinkan
                </h2>
                <p className="text-sm sm:text-[15px] leading-7 text-[#4e5666]">
                  Demi menjaga stabilitas sumber daya komputasi bersama dan
                  keamanan lingkungan server, pengguna dilarang keras melakukan
                  tindakan berikut:
                </p>
                <ul className="space-y-2.5 pt-1 text-sm sm:text-[15px] leading-7 text-[#4e5666] list-disc pl-5">
                  <li>
                    Mengunggah kode biner berbahaya, malware, arsip rekursif
                    (zip bomb), atau muatan yang dirancang untuk mengeksploitasi
                    parser dokumen dan gambar.
                  </li>
                  <li>
                    Melakukan pengiriman permintaan otomatis secara masif yang
                    bertujuan mengganggu ketersediaan layanan (Denial of
                    Service) atau memindai jaringan privat melalui URL media.
                  </li>
                  <li>
                    Mencoba melewati mekanisme otorisasi token kepemilikan atau
                    memindai direktori kerja milik sesi pengguna lain.
                  </li>
                  <li>
                    Memproses materi ilegal atau konten yang melanggar hukum
                    yang berlaku di yurisdiksi Anda.
                  </li>
                </ul>
              </section>

              <section
                id="hak-cipta-media"
                className="scroll-mt-24 border-t border-slate-900/10 pt-8 space-y-3"
              >
                <h2 className="font-brand text-xl font-semibold tracking-[-0.025em] text-[#0a0d14]">
                  Ketentuan Ekstraksi Media Sosial &amp; Hak Kekayaan Intelektual
                </h2>
                <p className="text-sm sm:text-[15px] leading-7 text-[#4e5666]">
                  Anda tetap memegang seluruh hak kekayaan intelektual atas
                  dokumen maupun karya asli yang Anda unggah ke FileVela. Untuk
                  modul ekstraksi stream media publik (TikTok, YouTube,
                  Instagram, X, Vimeo), layanan hanya bertindak sebagai
                  perantara teknis transien yang langsung membersihkan direktori
                  unduhan sementara setelah streaming selesai. Pengguna memikul
                  tanggung jawab penuh untuk memastikan bahwa pengunduhan media
                  mematuhi izin pemilik hak cipta serta ketentuan penggunaan
                  wajar (fair use).
                </p>
              </section>

              <section
                id="batasan-tanggung-jawab"
                className="scroll-mt-24 border-t border-slate-900/10 pt-8 space-y-3"
              >
                <h2 className="font-brand text-xl font-semibold tracking-[-0.025em] text-[#0a0d14]">
                  Penyimpanan Sementara &amp; Batasan Tanggung Jawab
                </h2>
                <p className="text-sm sm:text-[15px] leading-7 text-[#4e5666]">
                  FileVela bukan layanan cadangan awan permanen (cloud backup).
                  Seluruh hasil pemrosesan server akan dihapus secara permanen
                  setelah masa simpan 60 menit berakhir. Layanan disediakan
                  &quot;sebagaimana adanya&quot; (as is) tanpa jaminan bebas
                  gangguan mutlak; pastikan Anda senantiasa menyimpan salinan
                  berkas sumber asli pada perangkat penyimpanan pribadi Anda.
                </p>

                <div className="pt-4">
                  <Link
                    href="/docs"
                    className="btn-secondary-light text-xs sm:text-[13px]"
                  >
                    <span>Pelajari Spesifikasi Teknis di Dokumentasi</span>
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
