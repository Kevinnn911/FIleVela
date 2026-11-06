// File: src/app/page.tsx

'use client';

/*
 * THESIS: Calm sunlit porcelain editorial workstation with tactile frosted glass over a coastal horizon.
 * OWN-WORLD: Swiss precision utility studio, quiet coastal morning light, matte-black pill instruments.
 * STORY: 5 full-screen vertical slides -- Beranda -> Studio -> Kapabilitas -> Privasi -> FAQ.
 * FIRST VIEWPORT: Pure white editorial hero, matte-black CTA, and frosted-glass telemetry over sunlit water.
 * FORM: Pure white #ffffff + soft porcelain #f6f8fb, obsidian #0a0d14 ink, Onest typography, 680ms slide glide.
 */

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Header, ActiveTab } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { FullPageSlideDeck, SlideDefinition } from '@/components/FullPageSlideDeck';
import { FileUploadZone } from '@/components/FileUploadZone';
import { ConversionPanel } from '@/components/ConversionPanel';
import { CompressionPanel } from '@/components/CompressionPanel';
import { BgRemovalPanel } from '@/components/BgRemovalPanel';
import { SocialDownloaderPanel } from '@/components/SocialDownloaderPanel';
import { PdfToolsPanel } from '@/components/PdfToolsPanel';
import { BatchQueuePanel } from '@/components/BatchQueuePanel';
import { ResultPanel, JobResultData } from '@/components/ResultPanel';
import { SupportedFormatsModal } from '@/components/SupportedFormatsModal';
import { BgMode } from '@/lib/bg-removal/types';
import type { CompressionLevel } from '@/lib/compression/file-compressor';
import {
  canCompressClientSide,
  canProcessClientSide,
  compressClientSide,
  processDataClientSide,
  processImageClientSide,
} from '@/lib/client/privacy-processor';
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Cpu,
  DownloadCloud,
  Eraser,
  FileStack,
  FolderArchive,
  Lock,
  Minimize2,
  Plus,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

interface ModuleDescriptor {
  label: string;
  headline: string;
  subtitle: string;
  engineLabel: string;
  acceptedTypes: string;
  supportsClientPrivacy: boolean;
  supportsBatch: boolean;
  icon: React.ElementType;
}

const MODULE_ORDER: ActiveTab[] = [
  'convert',
  'compress',
  'bg-remove',
  'pdf-tools',
  'downloader',
];

const MODULE_META: Record<ActiveTab, ModuleDescriptor> = {
  convert: {
    label: 'Konversi',
    headline: 'Transcoding lintas format presisi.',
    subtitle:
      'Ubah dokumen Office, PDF, gambar raster maupun vektor, audio, video, dan data terstruktur dengan validasi signature biner asli.',
    engineLabel: 'Sharp / Office OpenXML / PDF-Lib / FFmpeg / Data Engine',
    acceptedTypes:
      'Dokumen (PDF, DOCX, ODT, RTF, PPTX, XLSX, HTML, MD, TXT), Gambar (PNG, JPG, WebP, AVIF, BMP, ICO, SVG, GIF, TIFF), Audio/Video, Data (CSV, TSV, JSON, XML, YAML)',
    supportsClientPrivacy: true,
    supportsBatch: true,
    icon: ArrowLeftRight,
  },
  compress: {
    label: 'Kompres',
    headline: 'Reduksi ukuran berkas tanpa merusak detail.',
    subtitle:
      'Optimalkan ukuran PDF ber-gambar, paket Office, citra resolusi tinggi, hingga aliran video MP4/WebM dan audio FFmpeg dalam tiga profil terukur.',
    engineLabel: 'Sharp Quantizer / PDF Stream Recompressor / FFmpeg CRF',
    acceptedTypes:
      'Dokumen PDF & Office (DOCX, PPTX, XLSX, ODT), Gambar (JPG, PNG, WebP, AVIF, GIF, BMP, SVG, TIFF), Media (MP4, WebM, MP3, WAV, OGG, FLAC, M4A, AAC), Data',
    supportsClientPrivacy: true,
    supportsBatch: true,
    icon: Minimize2,
  },
  'bg-remove': {
    label: 'Hapus BG',
    headline: 'Isolasi subjek & latar pas foto resmi.',
    subtitle:
      'Pisahkan latar belakang menggunakan flood-fill CIE-Lab dan deteksi tepi Sobel yang menjaga kemeja putih tetap utuh untuk PNG transparan, KTP, atau Paspor.',
    engineLabel: 'CIE-Lab Flood-Fill / Sobel Edge Barrier / Alpha Despill',
    acceptedTypes:
      'Citra Raster & Vektor: PNG, JPG, WebP, AVIF, TIFF, BMP, SVG, GIF, ICO',
    supportsClientPrivacy: false,
    supportsBatch: true,
    icon: Eraser,
  },
  'pdf-tools': {
    label: 'Alat PDF',
    headline: 'Gabung puluhan PDF & pisah rentang halaman.',
    subtitle:
      'Satukan hingga 60 dokumen PDF sesuai urutan atau ekstrak halaman spesifik tanpa merusak vektor teks dan struktur font asli.',
    engineLabel: 'PDF-Lib Structural Vector Engine',
    acceptedTypes: 'Dokumen PDF tidak terenkripsi (*.pdf)',
    supportsClientPrivacy: false,
    supportsBatch: false,
    icon: FileStack,
  },
  downloader: {
    label: 'Unduh Media',
    headline: 'Ekstraksi aliran video & audio publik.',
    subtitle:
      'Inspeksi metadata tautan publik dan alirkan bitstream MP4 tanpa watermark atau trek audio MP3 secara langsung ke perangkat Anda.',
    engineLabel: 'Stream Inspector / FFmpeg Remuxer / SSRF Guard',
    acceptedTypes:
      'Tautan URL Publik (TikTok, YouTube & Shorts, Instagram Reels, X, Vimeo)',
    supportsClientPrivacy: false,
    supportsBatch: false,
    icon: DownloadCloud,
  },
};

const CAPABILITY_ROWS: Array<{
  id: string;
  targetTab: ActiveTab;
  previewHeader: string;
  icon: React.ElementType;
  title: string;
  description: string;
  tags: string[];
}> = [
  {
    id: 'convert',
    targetTab: 'convert',
    previewHeader: 'Matriks Signature Biner',
    icon: ArrowLeftRight,
    title: 'Konversi Asli Tanpa Pemalsuan Ekstensi',
    description:
      'Setiap unggahan diperiksa magic-bytes binernya sebelum menyentuh adapter. Dokumen DOCX, XLSX, ODT, dan RTF dibangun atau diurai pada level struktur XML/PDF murni, sementara format biner lawas yang tidak memiliki engine aktif ditolak secara jujur.',
    tags: ['35+ Format', 'Magic-Bytes Verified', 'Batch .ZIP'],
  },
  {
    id: 'compress',
    targetTab: 'compress',
    previewHeader: 'Profil Reduksi Terukur',
    icon: Minimize2,
    title: 'Kompresi Multi-Lapis hingga Video & Audio',
    description:
      'Tidak sekadar menyalin berkas: engine merekompresi stream JPEG tertanam di dalam PDF dan bundel Office, mengkuantisasi palet PNG/WebP/AVIF, serta menjalankan transcoding CRF/bitrate FFmpeg pada MP4, WebM, dan MP3.',
    tags: ['PDF Image Recompress', 'FFmpeg H.264/VP9', 'Anti-Inflate Guard'],
  },
  {
    id: 'bg-remove',
    targetTab: 'bg-remove',
    previewHeader: 'Segmentasi Pas Foto & Produk',
    icon: Eraser,
    title: 'Segmentasi Pas Foto & Produk Berbasis Tepi Sobel',
    description:
      'Algoritma flood-fill ruang warna perseptual CIE-Lab mulai dari batas tepi bingkai dengan penghalang gradien Sobel menjaga area terang internal seperti kemeja putih, mata, dan gigi tetap utuh dengan penghalusan alpha 2 piksel.',
    tags: ['Merah KTP #DC2626', 'Biru Paspor #1E40AF', 'Batch Studio'],
  },
  {
    id: 'pdf-media',
    targetTab: 'pdf-tools',
    previewHeader: 'Vektor PDF & Stream Publik',
    icon: FileStack,
    title: 'Pengelola PDF Vektor & Ekstraksi Stream Aman',
    description:
      'Gabungkan hingga 60 berkas PDF sekaligus atau pisahkan halaman terpilih ke arsip ZIP tanpa merasterisasi teks. Modul pengunduh media dilengkapi proteksi SSRF ketat pada alamat jaringan internal.',
    tags: ['Hingga 60 PDF', 'Deteksi Enkripsi', 'Streaming Langsung'],
  },
];

const PRIVACY_PILLARS = [
  {
    id: 'local-ram',
    title: 'Eksekusi Memori Lokal (Zero-Upload)',
    badge: '0 Byte Unggahan Server',
    metric: '100% RAM Browser',
    statusLabel: 'HTML5 Canvas & Client ZIP Aktif',
    description:
      'Gambar PNG/JPG/WebP/SVG dan data CSV/TSV/JSON/TXT diproses offline di tab peramban, termasuk pengemasan batch .ZIP lokal.',
  },
  {
    id: 'sha256-token',
    title: 'Otorisasi Kriptografis SHA-256',
    badge: 'Isolasi Sesi 256-Bit',
    metric: 'TTL Maks. 60 Menit',
    statusLabel: 'Hash Token Sesi & Hapus Instan',
    description:
      'Setiap job server menghasilkan token 256-bit unik; server hanya menyimpan hash sehingga UUID tidak dapat ditebak pihak lain.',
  },
  {
    id: 'zero-tracking',
    title: 'Tanpa Akun & Tanpa Pelatihan AI',
    badge: 'Zero Dataset Retention',
    metric: '0 Pelacak Iklan',
    statusLabel: 'Privasi Dokumen Terlindungi Penuh',
    description:
      'Tidak ada pelacakan iklan lintas situs dan berkas Anda tidak pernah dijadikan dataset model AI pihak ketiga.',
  },
];

const FAQ_ITEMS = [
  {
    question: 'Apa perbedaan Mode Privasi Lokal dengan pemrosesan standar?',
    answer:
      'Saat Mode Privasi diaktifkan pada bilah atas, konversi dan kompresi gambar raster (PNG, JPG, WebP, SVG) serta data terstruktur (CSV, TSV, JSON, TXT) dijalankan 100% di dalam RAM browser menggunakan HTML5 Canvas tanpa mengunggah satu byte pun ke server. Untuk format berat seperti DOCX, PDF, atau video FFmpeg, sandbox server terisolasi digunakan dengan penghapusan otomatis maksimum 60 menit.',
  },
  {
    question: 'Apakah saya dapat memproses puluhan berkas sekaligus?',
    answer:
      'Ya. Modul Konversi, Kompres, dan Hapus BG semuanya mendukung pemilihan maupun seret-lepas puluhan berkas sekaligus dengan pemrosesan paralel terkendali dan pengunduhan seluruh hasil dalam satu arsip .ZIP. Modul Gabung PDF mendukung penggabungan hingga 60 dokumen PDF dalam satu kali proses.',
  },
  {
    question: 'Bagaimana FileVela melindungi kemeja putih saat menghapus latar pas foto?',
    answer:
      'Engine segmentasi lokal memulai penelusuran latar hanya dari piksel tepi luar gambar dalam ruang warna CIE-Lab dan berhenti ketika menemui batas kontras gradien Sobel (seperti garis bahu, kerah, atau jas). Dengan demikian warna putih di bagian dalam subjek tidak ikut terhapus.',
  },
  {
    question: 'Apa yang terjadi jika hasil kompresi ternyata lebih besar dari berkas asli?',
    answer:
      'FileVela menerapkan penjaga anti-inflasi ketat pada seluruh jalur kompresi gambar, PDF, Office, teks, maupun media FFmpeg. Apabila berkas sumber sudah terkompresi sangat padat sehingga kandidat keluaran menjadi lebih besar, sistem mempertahankan ukuran optimal berkas sumber secara jujur.',
  },
  {
    question: 'Berapa lama berkas saya berada di server dan bisakah dihapus seketika?',
    answer:
      'Setiap pekerjaan server dikunci dengan hash token kepemilikan SHA-256 256-bit yang hanya dipegang sesi peramban Anda. Berkas dimusnahkan otomatis dalam 60 menit oleh penyapu penyimpanan aktif, atau dapat Anda hapus permanen detik itu juga melalui tombol Hapus Server pada panel hasil maupun antrian batch.',
  },
];

export default function HomePage() {
  const [activeSlide, setActiveSlide] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<ActiveTab>('convert');
  const [activePrivacyIdx, setActivePrivacyIdx] = useState<number>(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [privacyMode, setPrivacyMode] = useState<boolean>(false);
  const [isFormatsModalOpen, setIsFormatsModalOpen] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentJob, setCurrentJob] = useState<JobResultData | null>(null);
  const [ownerToken, setOwnerToken] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const localBlobUrlRef = useRef<string | null>(null);

  const revokeActiveBlobUrl = () => {
    if (localBlobUrlRef.current) {
      URL.revokeObjectURL(localBlobUrlRef.current);
      localBlobUrlRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (localBlobUrlRef.current) {
        URL.revokeObjectURL(localBlobUrlRef.current);
      }
    };
  }, []);

  const currentModule = MODULE_META[activeTab];
  const selectedPrivacyPillar =
    PRIVACY_PILLARS[activePrivacyIdx] ?? PRIVACY_PILLARS[0]!;

  const handleClearFile = () => {
    revokeActiveBlobUrl();
    setSelectedFile(null);
    setSelectedFiles([]);
    setCurrentJob(null);
    setOwnerToken(null);
    setGeneralError(null);
  };

  const handleTabSwitch = (nextTab: ActiveTab) => {
    setActiveTab(nextTab);
    handleClearFile();
  };

  const handleOpenModuleInStudio = (targetTab: ActiveTab) => {
    handleTabSwitch(targetTab);
    setActiveSlide(1);
  };

  const handleCapsuleKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = MODULE_ORDER[(index + 1) % MODULE_ORDER.length];
      if (next) handleTabSwitch(next);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev =
        MODULE_ORDER[(index - 1 + MODULE_ORDER.length) % MODULE_ORDER.length];
      if (prev) handleTabSwitch(prev);
    }
  };

  const handleFilesSelect = (files: File[]) => {
    setGeneralError(null);
    if (files.length === 1 && files[0]) {
      setSelectedFile(files[0]);
      setSelectedFiles([]);
    } else if (files.length > 1) {
      if (currentModule.supportsBatch) {
        setSelectedFiles(files);
        setSelectedFile(null);
      } else if (files[0]) {
        setSelectedFile(files[0]);
        setSelectedFiles([]);
      }
    }
  };

  const handleConvert = async (
    targetFormat: string,
    options?: Record<string, unknown>
  ) => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setGeneralError(null);
    revokeActiveBlobUrl();

    const srcExt = selectedFile.name.split('.').pop()?.toLowerCase() || '';

    if (privacyMode) {
      if (!canProcessClientSide(srcExt, targetFormat)) {
        setIsProcessing(false);
        setGeneralError(
          `Konversi dari .${srcExt.toUpperCase()} ke .${targetFormat.toUpperCase()} membutuhkan adapter server FileVela. Nonaktifkan Mode Privasi pada bilah atas bila Anda mengizinkan pemrosesan di sandbox server sementara.`
        );
        return;
      }

      try {
        const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(srcExt);
        const startTime = Date.now();
        const normalizedQuality =
          typeof options?.quality === 'number'
            ? Math.min(1, Math.max(0.1, options.quality / 100))
            : 0.9;

        const clientResult = isImage
          ? await processImageClientSide(
              selectedFile,
              targetFormat,
              normalizedQuality
            )
          : await processDataClientSide(selectedFile, targetFormat);

        const durationMs = Date.now() - startTime;
        const localDownloadUrl = URL.createObjectURL(clientResult.blob);
        localBlobUrlRef.current = localDownloadUrl;

        const privacyJob: JobResultData = {
          id: `local_privacy_${Date.now()}`,
          status: 'succeeded',
          sourceFormat: srcExt,
          targetFormat,
          originalFilename: selectedFile.name,
          outputFilename: clientResult.filename,
          inputSizeBytes: selectedFile.size,
          outputSizeBytes: clientResult.sizeBytes,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          downloadUrl: localDownloadUrl,
          durationMs,
          metadata: {
            isClientSidePrivacy: true,
            durationMs,
          },
        };

        setCurrentJob(privacyJob);
        setOwnerToken('local_privacy_token');
        return;
      } catch (err) {
        setGeneralError(
          err instanceof Error
            ? err.message
            : 'Gagal memproses berkas secara lokal di browser.'
        );
        return;
      } finally {
        setIsProcessing(false);
      }
    }

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('targetFormat', targetFormat);
      if (options) {
        formData.append('options', JSON.stringify(options));
      }

      const response = await fetch('/api/jobs', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || data.error || 'Gagal memproses konversi berkas.'
        );
      }

      setCurrentJob(data.job);
      setOwnerToken(data.ownerToken);
    } catch (err) {
      setGeneralError(
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan yang tidak terduga.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompress = async (level: CompressionLevel) => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setGeneralError(null);
    revokeActiveBlobUrl();

    const srcExt = selectedFile.name.split('.').pop()?.toLowerCase() || '';

    if (privacyMode) {
      if (!canCompressClientSide(srcExt)) {
        setIsProcessing(false);
        setGeneralError(
          `Kompresi berkas .${srcExt.toUpperCase()} membutuhkan engine server terisolasi. Nonaktifkan Mode Privasi untuk melanjutkan.`
        );
        return;
      }

      try {
        const startTime = Date.now();
        const clientRes = await compressClientSide(selectedFile, level);
        const durationMs = Date.now() - startTime;
        const localDownloadUrl = URL.createObjectURL(clientRes.blob);
        localBlobUrlRef.current = localDownloadUrl;

        setCurrentJob({
          id: `local_compress_${Date.now()}`,
          status: 'succeeded',
          sourceFormat: srcExt,
          targetFormat: srcExt,
          originalFilename: selectedFile.name,
          outputFilename: clientRes.filename,
          inputSizeBytes: selectedFile.size,
          outputSizeBytes: clientRes.sizeBytes,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          downloadUrl: localDownloadUrl,
          durationMs,
          metadata: {
            isClientSidePrivacy: true,
            compressionLevel: level,
            durationMs,
          },
        });
        setOwnerToken('local_privacy_token');
        return;
      } catch (err) {
        setGeneralError(
          err instanceof Error
            ? err.message
            : 'Gagal mengompresi berkas secara lokal di browser.'
        );
        return;
      } finally {
        setIsProcessing(false);
      }
    }

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('level', level);

      const response = await fetch('/api/compress', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || data.error || 'Gagal memproses kompresi berkas.'
        );
      }

      setCurrentJob(data.job);
      setOwnerToken(data.ownerToken);
    } catch (err) {
      setGeneralError(
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan yang tidak terduga.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveBg = async (options?: {
    mode?: BgMode;
    tolerance?: number;
    replacementColor?: string;
    gradientStart?: string;
    gradientEnd?: string;
  }) => {
    if (!selectedFile) return;

    if (privacyMode) {
      setGeneralError(
        'Mode Privasi sedang aktif. Modul isolasi latar belakang membutuhkan engine server terisolasi (retensi maks. 60 menit). Nonaktifkan Mode Privasi untuk melanjutkan.'
      );
      return;
    }

    setIsProcessing(true);
    setGeneralError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (options?.mode) {
        formData.append('mode', options.mode);
      }
      if (options?.tolerance !== undefined) {
        formData.append('tolerance', options.tolerance.toString());
      }
      if (options?.replacementColor) {
        formData.append('replacementColor', options.replacementColor);
      }
      if (options?.gradientStart) {
        formData.append('gradientStart', options.gradientStart);
      }
      if (options?.gradientEnd) {
        formData.append('gradientEnd', options.gradientEnd);
      }

      const response = await fetch('/api/background-removal', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            data.error ||
            'Gagal memproses penghapusan latar belakang gambar.'
        );
      }

      setCurrentJob(data.job);
      setOwnerToken(data.ownerToken);
    } catch (err) {
      setGeneralError(
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan yang tidak terduga.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteJob = async (jobId: string, token: string) => {
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: 'DELETE',
      headers: {
        'X-Session-Token': token,
      },
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Gagal menghapus berkas pekerjaan.');
    }
  };

  const isPrivacyBlockedOnCurrentTab =
    privacyMode && !currentModule.supportsClientPrivacy;

  const isBatchActive =
    selectedFiles.length > 1 &&
    (activeTab === 'convert' ||
      activeTab === 'compress' ||
      activeTab === 'bg-remove');

  const renderCapabilityPreview = (rowId: string) => {
    if (rowId === 'convert') {
      return (
        <div className="space-y-2 text-[11px]">
          <div className="flex items-center justify-between rounded-xl bg-[#f6f8fb] px-3 py-2">
            <span className="font-mono font-semibold text-[#0a0d14]">
              .DOCX -&gt; .PDF
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-[#1d4ed8]">
              <CheckCircle2 className="h-3 w-3" />
              <span>OpenXML Murni</span>
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[#f6f8fb] px-3 py-2">
            <span className="font-mono font-semibold text-[#0a0d14]">
              .CSV -&gt; .XLSX
            </span>
            <span className="font-mono text-[#4e5666]">Magic-Bytes OK</span>
          </div>
        </div>
      );
    }

    if (rowId === 'compress') {
      return (
        <div className="space-y-2 text-[11px]">
          <div className="flex items-center justify-between rounded-xl bg-[#f6f8fb] px-3 py-2">
            <span className="font-medium text-[#0a0d14]">
              Stream PDF &amp; Citra
            </span>
            <span className="rounded-full bg-[#e8f0fe] px-2 py-0.5 font-mono font-semibold text-[#1d4ed8]">
              -55% Optimal
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[#f6f8fb] px-3 py-2">
            <span className="font-mono text-[#4e5666]">FFmpeg H.264 / MP3</span>
            <span className="font-medium text-[#0a0d14]">Anti-Inflate</span>
          </div>
        </div>
      );
    }

    if (rowId === 'bg-remove') {
      return (
        <div className="space-y-2 text-[11px]">
          <div className="flex items-center justify-between rounded-xl bg-[#f6f8fb] px-3 py-2">
            <span className="font-medium text-[#0a0d14]">
              Presisi Latar Resmi
            </span>
            <div className="flex items-center gap-1.5">
              <span
                title="Transparan"
                className="h-4 w-4 rounded-full border border-slate-900/15 checkerboard-premium"
              />
              <span
                title="Merah KTP #DC2626"
                className="h-4 w-4 rounded-full bg-[#dc2626]"
              />
              <span
                title="Biru Paspor #1E40AF"
                className="h-4 w-4 rounded-full bg-[#1e40af]"
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[#f6f8fb] px-3 py-2">
            <span className="font-mono text-[#4e5666]">CIE-Lab + Sobel</span>
            <span className="font-medium text-[#0a0d14]">Alpha 2px Halus</span>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2 text-[11px]">
        <div className="flex items-center justify-between rounded-xl bg-[#f6f8fb] px-3 py-2">
          <span className="font-medium text-[#0a0d14]">
            Gabung &amp; Pisah Vektor
          </span>
          <span className="font-mono font-semibold text-[#1d4ed8]">
            Maks. 60 PDF
          </span>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-[#f6f8fb] px-3 py-2">
          <span className="font-mono text-[#4e5666]">MP4 / MP3 Publik</span>
          <span className="font-medium text-[#0a0d14]">Proteksi SSRF</span>
        </div>
      </div>
    );
  };

  const slides: SlideDefinition[] = [
    {
      id: 'beranda',
      label: 'Beranda',
      content: (
        <div className="flex flex-1 flex-col justify-between bg-white">
          {/* Top Pure White Minimalist Editorial Masthead */}
          <div className="mx-auto flex w-full max-w-[1040px] flex-col items-center px-4 pt-2.5 sm:px-6 sm:pt-6 lg:pt-8 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#f6f8fb] border border-slate-900/[0.06] px-3 py-0.5 sm:px-3.5 sm:py-1 text-[11px] sm:text-xs font-medium text-[#2563eb]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2563eb]" />
              <span>Workstation Berkas Universal</span>
            </div>

            <h1 className="mt-2.5 sm:mt-3.5 font-brand text-[25px] sm:text-[44px] lg:text-[52px] font-semibold tracking-[-0.036em] leading-[1.1] sm:leading-[1.06] text-[#0a0d14] max-w-[19ch] sm:max-w-[18ch]">
              Pemrosesan Berkas Presisi, Dirancang untuk Alur Kerja Modern
            </h1>

            <p className="mt-2.5 sm:mt-3 max-w-[62ch] text-xs sm:text-[14px] leading-relaxed text-[#4e5666]">
              Konversi lintas 35+ format asli, kompresi multi-lapis, isolasi
              latar pas foto &amp; produk, pengelolaan PDF vektor, hingga
              ekstraksi stream media dalam satu instrumen terisolasi.
            </p>

            <div className="mt-4 sm:mt-5 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setActiveSlide(1)}
                className="btn-primary-dark px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-[13.5px]"
              >
                <span>Mulai Olah Berkas</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setActiveSlide(2)}
                className="btn-secondary-light px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-[13.5px]"
              >
                <span>Jelajahi Kapabilitas</span>
              </button>
            </div>
          </div>

          {/* Bottom Coastal Horizon Stage with Floating Frosted-Glass Telemetry */}
          <div className="coastal-horizon-band relative mt-3 sm:mt-4 w-full flex-1 flex items-end pb-4 sm:pb-7 pt-4 sm:pt-8">
            <div className="relative mx-auto w-full max-w-[1040px] px-3.5 sm:px-6">
              {/* Subtle Floating Tactile Glass Accent Left (Desktop) */}
              <div className="hidden lg:flex items-center gap-2.5 surface-glass px-4 py-2.5 absolute -left-3 -top-5 z-10 -rotate-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#111315] text-white">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </span>
                <div className="text-left">
                  <p className="text-[11px] font-semibold text-[#0a0d14]">
                    Magic-Bytes Verified
                  </p>
                  <p className="font-mono text-[10px] text-[#4e5666]">
                    Validasi Biner &amp; SHA-256
                  </p>
                </div>
              </div>

              {/* Subtle Floating Tactile Glass Accent Right (Desktop) */}
              <div className="hidden lg:flex items-center gap-2.5 surface-glass px-4 py-2.5 absolute -right-3 -bottom-2 z-10 rotate-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#2563eb] text-white">
                  <FolderArchive className="h-3.5 w-3.5" />
                </span>
                <div className="text-left">
                  <p className="text-[11px] font-semibold text-[#0a0d14]">
                    Antrian Batch .ZIP
                  </p>
                  <p className="font-mono text-[10px] text-[#4e5666]">
                    Multi-Berkas &amp; Mode Lokal
                  </p>
                </div>
              </div>

              {/* Main 3-Column Frosted Glass Architecture Telemetry Card */}
              <div className="surface-glass p-3.5 sm:p-6">
                <div className="grid grid-cols-1 gap-2.5 divide-y divide-slate-900/10 sm:grid-cols-3 sm:gap-5 sm:divide-y-0 sm:divide-x sm:divide-slate-900/10">
                  <div className="sm:pr-6">
                    <span className="block text-[10.5px] sm:text-[11px] font-medium text-[#4e5666]">
                      Cakupan Codec Aktif
                    </span>
                    <p className="mt-0.5 sm:mt-1 font-brand text-lg sm:text-[30px] font-semibold tracking-[-0.03em] text-[#0a0d14]">
                      35+ Format Asli
                    </p>
                    <p className="mt-0.5 sm:mt-1.5 text-[11px] sm:text-xs leading-snug sm:leading-relaxed text-[#4e5666]">
                      Gambar, dokumen OpenXML/ODF/RTF, PDF, audio, video FFmpeg,
                      dan data tabular tervalidasi magic-bytes.
                    </p>
                  </div>

                  <div className="pt-2.5 sm:pt-0 sm:px-6">
                    <span className="block text-[10.5px] sm:text-[11px] font-medium text-[#4e5666]">
                      Siklus Sandbox Server
                    </span>
                    <p className="mt-0.5 sm:mt-1 font-brand text-lg sm:text-[30px] font-semibold tracking-[-0.03em] text-[#0a0d14]">
                      60m Retensi Maks
                    </p>
                    <p className="mt-0.5 sm:mt-1.5 text-[11px] sm:text-xs leading-snug sm:leading-relaxed text-[#4e5666]">
                      Direktori kerja server terisolasi token SHA-256 dihapus
                      otomatis dalam 60 menit atau seketika atas perintah Anda.
                    </p>
                  </div>

                  <div className="pt-2.5 sm:pt-0 sm:pl-6">
                    <span className="block text-[10.5px] sm:text-[11px] font-medium text-[#4e5666]">
                      Mode Privasi Perangkat
                    </span>
                    <p className="mt-0.5 sm:mt-1 font-brand text-lg sm:text-[30px] font-semibold tracking-[-0.03em] text-[#0a0d14]">
                      0 Byte Jejak Lokal
                    </p>
                    <p className="mt-0.5 sm:mt-1.5 text-[11px] sm:text-xs leading-snug sm:leading-relaxed text-[#4e5666]">
                      Saat Mode Privasi aktif, konversi &amp; kompresi berkas
                      kompatibel berlangsung murni di RAM peramban.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'studio',
      label: 'Studio',
      content: (
        <div className="flex flex-1 flex-col justify-center py-4 sm:py-8">
          <div className="mx-auto w-full max-w-[1040px] px-3.5 sm:px-6">
            {/* Studio Module Header & Format Catalog Trigger */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 sm:gap-4">
              <div className="max-w-2xl space-y-1 sm:space-y-1.5">
                <div className="inline-flex items-center gap-2 text-[11px] sm:text-xs font-medium text-[#2563eb]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#2563eb]" />
                  <span>Studio Pemrosesan Berkas</span>
                </div>
                <h2 className="font-brand text-xl sm:text-[34px] font-semibold tracking-[-0.032em] leading-[1.12] sm:leading-[1.1] text-[#0a0d14]">
                  {currentModule.headline}
                </h2>
                <p className="text-xs sm:text-[14px] text-[#4e5666] leading-relaxed">
                  {currentModule.subtitle}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsFormatsModalOpen(true)}
                className="btn-ghost-clean self-start md:self-auto min-h-[34px] sm:min-h-[38px] px-3 sm:px-3.5 py-1 sm:py-1.5 text-xs shrink-0"
              >
                <span className="h-2 w-2 rounded-full bg-[#2563eb]" />
                <span className="font-mono text-[11px] text-[#0a0d14]">
                  35+ Format Aktif
                </span>
              </button>
            </div>

            {/* 5 Stage Tool Capsules */}
            <div className="mt-4 sm:mt-5 mb-3.5 sm:mb-4 flex flex-wrap items-center justify-between gap-3">
              <div
                role="tablist"
                aria-label="Pilih modul pemrosesan"
                className="flex w-full sm:w-auto flex-wrap items-center gap-1 rounded-[20px] sm:rounded-full border border-slate-900/[0.07] bg-[#f6f8fb] p-1 sm:p-1.5"
              >
                {MODULE_ORDER.map((tabId, idx) => {
                  const mod = MODULE_META[tabId];
                  const Icon = mod.icon;
                  const isActive = activeTab === tabId;

                  return (
                    <button
                      key={tabId}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => handleTabSwitch(tabId)}
                      onKeyDown={(e) => handleCapsuleKeyDown(e, idx)}
                      className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-full px-2.5 sm:px-4 py-1.5 sm:py-2 text-[11.5px] sm:text-[13px] whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                        isActive
                          ? 'bg-[#111315] text-white font-semibold shadow-sm'
                          : 'text-[#4e5666] hover:text-[#0a0d14] font-medium'
                      }`}
                    >
                      <Icon
                        className={`h-3.5 w-3.5 shrink-0 ${
                          isActive ? 'text-white' : 'text-[#4e5666]'
                        }`}
                      />
                      <span>{mod.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pure White Elevated Workstation Panel */}
            <div className="surface-elevated overflow-hidden">
              {/* Integrated Instrument Telemetry Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900/[0.07] bg-[#f6f8fb]/70 px-3.5 sm:px-7 py-2.5 sm:py-3 text-xs">
                <div className="flex items-center gap-2 text-[#4e5666] min-w-0 flex-1">
                  <Cpu className="h-3.5 w-3.5 shrink-0 text-[#2563eb]" />
                  <span className="truncate font-mono text-[10.5px] sm:text-[11px]">
                    {currentModule.engineLabel}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {privacyMode ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-[#1d4ed8]">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span className="text-[10.5px] sm:text-[11px]">
                        Mode Privasi Lokal (0 Byte)
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[#4e5666]">
                      <Lock className="h-3 w-3 text-[#0a0d14]" />
                      <span className="font-mono text-[10.5px] sm:text-[11px]">
                        Sandbox Terisolasi / TTL 60m
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* Honest Privacy Scope Guard Banner on Server-Only Modules */}
              {isPrivacyBlockedOnCurrentTab && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-blue-200/80 bg-[#f0f6ff] px-3.5 sm:px-7 py-3 sm:py-3.5 text-xs">
                  <div className="flex items-start sm:items-center gap-2.5 text-[#0a0d14]">
                    <ShieldAlert className="h-4 w-4 shrink-0 text-[#2563eb] mt-0.5 sm:mt-0" />
                    <span>
                      <strong>Mode Privasi Lokal aktif:</strong> Modul ini
                      membutuhkan engine server terisolasi (dihapus otomatis
                      dalam 60 menit). Unggahan ke server ditahan hingga Anda
                      mengizinkan.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPrivacyMode(false);
                      setGeneralError(null);
                    }}
                    className="btn-secondary-light min-h-[34px] px-3.5 py-1 text-xs self-end sm:self-center shrink-0 bg-white"
                  >
                    Izinkan Sandbox Server
                  </button>
                </div>
              )}

              {/* Main Workstation Stage Body */}
              <div className="p-3.5 sm:p-7">
                {activeTab === 'downloader' ? (
                  isPrivacyBlockedOnCurrentTab ? (
                    <div className="py-8 text-center space-y-3.5">
                      <p className="text-sm font-semibold text-[#0a0d14]">
                        Ekstraksi Media Membutuhkan Koneksi Server
                      </p>
                      <p className="max-w-md mx-auto text-xs text-[#4e5666] leading-relaxed">
                        Pengambilan stream dari platform pihak ketiga tidak
                        dapat dijalankan secara offline di memori browser karena
                        pembatasan jaringan CORS.
                      </p>
                      <button
                        type="button"
                        onClick={() => setPrivacyMode(false)}
                        className="btn-secondary-light text-xs"
                      >
                        Nonaktifkan Mode Privasi
                      </button>
                    </div>
                  ) : (
                    <SocialDownloaderPanel />
                  )
                ) : activeTab === 'pdf-tools' ? (
                  currentJob && ownerToken ? (
                    <ResultPanel
                      job={currentJob}
                      ownerToken={ownerToken}
                      onReset={handleClearFile}
                      onDeleteJob={handleDeleteJob}
                    />
                  ) : isPrivacyBlockedOnCurrentTab ? (
                    <div className="py-8 text-center space-y-3.5">
                      <p className="text-sm font-semibold text-[#0a0d14]">
                        Alat PDF Membutuhkan Sandbox Server Terisolasi
                      </p>
                      <p className="max-w-md mx-auto text-xs text-[#4e5666] leading-relaxed">
                        Operasi penggabungan hingga 60 dokumen dan pemisahan
                        halaman PDF diproses di sandbox terisolasi dengan
                        retensi maksimum 60 menit.
                      </p>
                      <button
                        type="button"
                        onClick={() => setPrivacyMode(false)}
                        className="btn-secondary-light text-xs"
                      >
                        Izinkan Sandbox Server
                      </button>
                    </div>
                  ) : (
                    <PdfToolsPanel
                      onSuccess={(job, token) => {
                        setCurrentJob({
                          id: job.id,
                          jobId: job.id,
                          status: 'succeeded',
                          sourceFormat: 'pdf',
                          targetFormat: job.targetFormat,
                          originalFilename: job.originalFilename,
                          outputFilename: job.outputFilename,
                          inputSizeBytes: job.inputSizeBytes,
                          outputSizeBytes: job.outputSizeBytes,
                          createdAt: new Date().toISOString(),
                          expiresAt: new Date(
                            Date.now() + 3600000
                          ).toISOString(),
                          downloadUrl: job.downloadUrl,
                          metadata: job.metadata,
                        });
                        setOwnerToken(token);
                      }}
                    />
                  )
                ) : currentJob && ownerToken ? (
                  <ResultPanel
                    job={currentJob}
                    ownerToken={ownerToken}
                    onReset={handleClearFile}
                    onDeleteJob={handleDeleteJob}
                  />
                ) : isBatchActive ? (
                  <BatchQueuePanel
                    files={selectedFiles}
                    mode={activeTab}
                    onClearQueue={handleClearFile}
                    onRemoveItem={(index) => {
                      const updated = selectedFiles.filter(
                        (_, i) => i !== index
                      );
                      if (updated.length === 1 && updated[0]) {
                        setSelectedFile(updated[0]);
                        setSelectedFiles([]);
                      } else {
                        setSelectedFiles(updated);
                      }
                    }}
                    privacyMode={privacyMode}
                  />
                ) : (
                  <div>
                    <FileUploadZone
                      onFileSelect={(file) => {
                        setSelectedFile(file);
                        setSelectedFiles([]);
                        setGeneralError(null);
                      }}
                      onFilesSelect={handleFilesSelect}
                      selectedFile={selectedFile}
                      onClearFile={handleClearFile}
                      isProcessing={isProcessing}
                      acceptedTypesLabel={currentModule.acceptedTypes}
                      multiple={currentModule.supportsBatch}
                    />

                    {selectedFile && activeTab === 'convert' && (
                      <ConversionPanel
                        selectedFile={selectedFile}
                        onConvert={handleConvert}
                        isConverting={isProcessing}
                        privacyMode={privacyMode}
                      />
                    )}

                    {selectedFile && activeTab === 'compress' && (
                      <CompressionPanel
                        selectedFile={selectedFile}
                        onCompress={handleCompress}
                        isCompressing={isProcessing}
                        privacyMode={privacyMode}
                      />
                    )}

                    {selectedFile && activeTab === 'bg-remove' && (
                      <BgRemovalPanel
                        selectedFile={selectedFile}
                        onRemoveBg={handleRemoveBg}
                        isProcessing={isProcessing}
                      />
                    )}

                    {generalError && (
                      <div
                        role="alert"
                        className="mt-4 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50/90 p-4 text-xs text-red-900"
                      >
                        <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                        <span className="leading-relaxed font-medium">
                          {generalError}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'fitur',
      label: 'Kapabilitas',
      content: (
        <div className="flex flex-1 flex-col justify-center py-4 sm:py-6">
          <div className="mx-auto w-full max-w-[1080px] px-3.5 sm:px-6">
            {/* Centered Minimalist Section Masthead */}
            <div className="mx-auto max-w-2xl text-center space-y-1.5 mb-4 sm:mb-6">
              <p className="text-xs font-medium text-[#2563eb]">
                Kapabilitas Terpadu
              </p>
              <h2 className="font-brand text-xl sm:text-[32px] font-semibold tracking-[-0.032em] leading-[1.12] text-[#0a0d14]">
                Dirancang sebagai instrumen rekayasa, bukan pembungkus ekstensi
                semu.
              </h2>
              <p className="text-xs sm:text-[13.5px] text-[#4e5666] leading-relaxed">
                Setiap modul dibangun di atas parser biner dan codec teruji agar
                hasil keluaran tetap akurat, ringan, dan siap produksi.
              </p>
            </div>

            {/* 2x2 Soft Porcelain Bento Grid with Crisp White Mini-UI Preview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {CAPABILITY_ROWS.map((row) => {
                const Icon = row.icon;
                return (
                  <div
                    key={row.id}
                    className="surface-porcelain flex flex-col justify-between p-3.5 sm:p-5"
                  >
                    <div>
                      {/* Crisp Pure White Elevated Mini-UI Card */}
                      <div className="rounded-2xl border border-slate-900/[0.06] bg-white p-3 sm:p-3.5 shadow-soft">
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#f6f8fb] border border-slate-900/[0.06] text-[#0a0d14]">
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="text-xs font-semibold text-[#0a0d14]">
                              {row.previewHeader}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              handleOpenModuleInStudio(row.targetTab)
                            }
                            aria-label={`Buka modul ${row.title} di Studio`}
                            className="flex h-6 w-6 items-center justify-center rounded-full text-[#4e5666] hover:bg-[#f6f8fb] hover:text-[#0a0d14] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {renderCapabilityPreview(row.id)}
                      </div>

                      <h3 className="mt-3 font-brand text-[15px] sm:text-base font-semibold tracking-[-0.02em] text-[#0a0d14]">
                        {row.title}
                      </h3>
                      <p className="mt-1 text-xs text-[#4e5666] leading-relaxed">
                        {row.description}
                      </p>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {row.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-slate-900/[0.08] bg-white px-2.5 py-0.5 font-mono text-[10.5px] font-medium text-[#0a0d14]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'privasi',
      label: 'Privasi',
      content: (
        <div className="flex flex-1 flex-col justify-center py-4 sm:py-7">
          <div className="mx-auto w-full max-w-[1080px] px-3.5 sm:px-6 space-y-4 sm:space-y-7">
            {/* Editorial Two-Tone Statement */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4 items-end">
              <div className="lg:col-span-8 space-y-1.5 sm:space-y-2">
                <p className="text-xs font-medium text-[#2563eb]">
                  Arsitektur Keamanan &amp; Privasi
                </p>
                <h2 className="font-brand text-xl sm:text-[32px] font-semibold tracking-[-0.032em] leading-[1.12] text-[#0a0d14]">
                  Catatan Privasi Jujur: Kendali Penuh di Tangan Anda
                </h2>
                <p className="text-xs sm:text-[15.5px] leading-relaxed max-w-[62ch]">
                  <span className="font-medium text-[#0a0d14]">
                    Kami memisahkan secara tegas pemrosesan lokal di perangkat
                    dari pemrosesan sandbox server.
                  </span>{' '}
                  <span className="text-[#5b6374]">
                    Tidak ada klaim semu: Anda selalu mengetahui kapan berkas
                    diproses di memori browser dan kapan membutuhkan codec
                    server sementara.
                  </span>
                </p>
              </div>

              <div className="lg:col-span-4 lg:text-right">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-900/10 bg-[#f6f8fb] px-3.5 py-1.5 text-xs font-medium text-[#0a0d14]">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#2563eb]" />
                  <span>
                    Status Saat Ini:{' '}
                    <strong>
                      {privacyMode ? 'Lokal (RAM)' : 'Sandbox TTL 60m'}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* 3-Column Interactive Privacy Architecture Switcher */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 lg:gap-7 items-center">
              {/* Left Column: Hairline Pillar Switcher */}
              <div
                role="tablist"
                aria-label="Pilar privasi dan keamanan FileVela"
                className="lg:col-span-4 divide-y divide-slate-900/10 border-y border-slate-900/10"
              >
                {PRIVACY_PILLARS.map((pillar, idx) => {
                  const isSelected = activePrivacyIdx === idx;
                  return (
                    <button
                      key={pillar.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => setActivePrivacyIdx(idx)}
                      className="flex w-full items-center justify-between gap-3 py-3 sm:py-3.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] rounded"
                    >
                      <div className="flex items-center gap-2.5">
                        {isSelected && (
                          <ArrowRight className="h-4 w-4 shrink-0 text-[#2563eb]" />
                        )}
                        <span
                          className={`text-xs sm:text-[15px] transition-colors ${
                            isSelected
                              ? 'font-semibold text-[#0a0d14]'
                              : 'font-medium text-[#5b6374] hover:text-[#0a0d14]'
                          }`}
                        >
                          {pillar.title}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Center Column: Coastal Horizon Frame with Frosted-Glass Live Card */}
              <div className="lg:col-span-4">
                <div className="coastal-frame p-4 sm:p-6">
                  <div className="surface-glass p-4 sm:p-5 space-y-3.5 sm:space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#0a0d14]">
                        Proteksi Aktif
                      </span>
                      <span className="rounded-full bg-white/90 border border-slate-900/10 px-2.5 py-0.5 font-mono text-[10.5px] font-semibold text-[#1d4ed8]">
                        {selectedPrivacyPillar.badge}
                      </span>
                    </div>

                    {/* Segmented Mode Indicator Inside Glass Card */}
                    <div className="grid grid-cols-2 gap-1 rounded-full bg-slate-900/[0.06] p-1 text-center text-[11px]">
                      <button
                        type="button"
                        onClick={() => setPrivacyMode(true)}
                        className={`rounded-full py-1.5 font-medium transition-colors ${
                          privacyMode
                            ? 'bg-white text-[#0a0d14] shadow-sm font-semibold'
                            : 'text-[#4e5666] hover:text-[#0a0d14]'
                        }`}
                      >
                        Mode Lokal RAM
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrivacyMode(false)}
                        className={`rounded-full py-1.5 font-medium transition-colors ${
                          !privacyMode
                            ? 'bg-white text-[#0a0d14] shadow-sm font-semibold'
                            : 'text-[#4e5666] hover:text-[#0a0d14]'
                        }`}
                      >
                        Sandbox Server
                      </button>
                    </div>

                    <div className="rounded-2xl bg-[#111315] p-3.5 sm:p-4 text-white space-y-1.5 sm:space-y-2">
                      <span className="block font-mono text-[10.5px] text-white/75">
                        {selectedPrivacyPillar.statusLabel}
                      </span>
                      <p className="font-brand text-lg sm:text-xl font-semibold tracking-[-0.02em]">
                        {selectedPrivacyPillar.metric}
                      </p>
                      <p className="text-[11px] text-white/80 leading-relaxed">
                        {selectedPrivacyPillar.title}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Verbatim Pillar Details & Direct Privacy Actions */}
              <div className="lg:col-span-4 space-y-3.5 sm:space-y-4">
                <div className="space-y-2.5 sm:space-y-3">
                  {PRIVACY_PILLARS.map((pillar, idx) => {
                    const isSelected = activePrivacyIdx === idx;
                    return (
                      <div
                        key={pillar.id}
                        className={
                          isSelected
                            ? 'rounded-2xl border border-slate-900/10 bg-[#f6f8fb] p-3.5 sm:p-4 space-y-1.5'
                            : 'hidden sm:block rounded-2xl border border-transparent px-4 py-2 space-y-0.5'
                        }
                      >
                        <p className="text-xs font-semibold text-[#0a0d14]">
                          {pillar.title}
                        </p>
                        <p className="text-xs text-[#4e5666] leading-relaxed">
                          {pillar.description}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-1 flex flex-wrap items-center gap-2 sm:gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPrivacyMode((prev) => !prev);
                      setGeneralError(null);
                    }}
                    className="btn-primary-dark text-xs sm:text-[13px]"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>
                      {privacyMode
                        ? 'Mode Privasi Sedang Aktif'
                        : 'Aktifkan Mode Privasi Sekarang'}
                    </span>
                  </button>

                  <Link
                    href="/privacy"
                    className="btn-secondary-light text-xs sm:text-[13px]"
                  >
                    <span>Baca Kebijakan Privasi</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-[#2563eb]" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'faq',
      label: 'FAQ',
      content: (
        <div className="flex flex-1 flex-col justify-between pt-6 sm:pt-12">
          <div className="mx-auto w-full max-w-[1080px] px-3.5 sm:px-6 pb-6 sm:pb-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 lg:gap-12">
              <div className="lg:col-span-4 space-y-2.5 sm:space-y-3">
                <p className="text-xs font-medium text-[#2563eb]">
                  Transparansi Teknis
                </p>
                <h2 className="font-brand text-xl sm:text-[32px] font-semibold tracking-[-0.03em] leading-[1.14] text-[#0a0d14]">
                  Pertanyaan Teknis Umum
                </h2>
                <p className="text-xs sm:text-sm text-[#4e5666] leading-relaxed">
                  Penjelasan transparan mengenai cara kerja engine, batas
                  kuota, dan jaminan keamanan berkas.
                </p>

                <div className="pt-2 sm:pt-3 flex flex-wrap items-center gap-2 sm:gap-2.5">
                  <button
                    type="button"
                    onClick={() => setActiveSlide(1)}
                    className="btn-primary-dark text-xs"
                  >
                    <span>Buka Studio</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <Link href="/docs" className="btn-secondary-light text-xs">
                    <span>Dokumentasi API</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-[#2563eb]" />
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-8 border-b border-slate-900/10">
                {FAQ_ITEMS.map((item, index) => (
                  <details
                    key={item.question}
                    open={index === 0}
                    className="minimal-faq group border-t border-slate-900/10"
                  >
                    <summary className="flex cursor-pointer items-center justify-between gap-4 py-3.5 sm:py-5 text-[13px] sm:text-[15px] font-semibold text-[#0a0d14] hover:text-[#2563eb] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] rounded">
                      <span>{item.question}</span>
                      <Plus className="h-4 w-4 shrink-0 text-[#4e5666] transition-transform duration-150 ease-out group-open:rotate-45 group-open:text-[#0a0d14]" />
                    </summary>
                    <p className="pb-4 sm:pb-5 pr-4 sm:pr-6 text-xs sm:text-sm text-[#4e5666] leading-relaxed sm:leading-7 max-w-[68ch]">
                      {item.answer}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          </div>

          <Footer compact />
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-[100dvh] bg-white text-[#0a0d14]">
      <Header
        activeSlide={activeSlide}
        onNavigateSlide={(idx) => setActiveSlide(idx)}
        onOpenFormatsModal={() => setIsFormatsModalOpen(true)}
        privacyMode={privacyMode}
        onTogglePrivacyMode={() => {
          setPrivacyMode((prev) => !prev);
          setGeneralError(null);
        }}
      />

      <main>
        <FullPageSlideDeck
          slides={slides}
          activeSlide={activeSlide}
          onSlideChange={setActiveSlide}
          isModalOpen={isFormatsModalOpen}
        />
      </main>

      <SupportedFormatsModal
        isOpen={isFormatsModalOpen}
        onClose={() => setIsFormatsModalOpen(false)}
      />
    </div>
  );
}
