# FileVela — Universal File Conversion & Background Removal Web Application

FileVela adalah aplikasi web produksi modern untuk konversi format file (gambar, data, media, dokumen) dan penghapusan background gambar dengan antarmuka penuh berbahasa Indonesia. Aplikasi dirancang dengan prinsip **Zero Fake Conversion**, **Anti-Deception**, **Secure Ephemeral Storage**, dan kepatuhan penuh terhadap **Zero Emoji Policy**.

---

## Fitur Utama

1. **Konversi Berkas Nyata Tanpa Pemalsuan Ekstensi**:
   - **Gambar Raster & Vektor**: PNG, JPG/JPEG, WebP, AVIF, TIFF, GIF, SVG -> Raster, serta Favicon ICO multi-resolusi (16x16, 32x32, 48x48) (ditenagai oleh Sharp). Mendukung opsi kualitas kompresi.
   - **Data Terstruktur**: JSON <-> CSV, JSON <-> YAML, JSON <-> XML, CSV <-> TSV, Markdown (.md) <-> HTML/TXT (ditenagai oleh Pure TypeScript).
   - **Media Audio & Video**: MP4, WebM, MP3, WAV, OGG, FLAC, M4A, AAC (ditenagai oleh adapter FFmpeg dengan pelaporan status jujur).
   - **Dokumen Kantor**: DOCX, PDF, ODT, RTF, TXT, HTML (ditenagai oleh adapter LibreOffice headless dengan pelaporan status jujur).
2. **Penghapus Background Gambar (Background Removal & Replacer)**:
   - Algoritma *Multi-Pass Adaptive Matting* dengan supresi pinggiran warna (*anti-halo edge suppression*) lokal berbasis Sharp.
   - Opsi penggantian latar belakang instan: Transparan (PNG RGBA), Warna Pas Foto Solid Resmi (Merah KTP, Biru Paspor, Putih Studio, Abu Formal), dan Gradasi Elegan (Sunset, Ocean, Emerald).
   - Pratinjau interaktif real-time di atas pola papan catur (*checkerboard pattern*).
3. **Universal Social Media & Video Downloader**:
   - Ekstraksi dan pengunduhan video/audio dari platform YouTube (Shorts & Reguler), TikTok, Instagram (Reels & Feed), dan Twitter/X.
   - Pilihan format unduhan: Video MP4 (kualitas HD & Standar) atau Ekstrak Audio MP3 (kualitas tinggi 320kbps & 128kbps).
   - Validasi URL aman dengan proteksi Anti-SSRF (pencegahan akses IP privat/localhost).
4. **Penyimpanan Privat & Keamanan Ephemeral**:
   - Berkas diisolasi dalam folder privat `.storage/jobs/{id}/` di luar direktori publik.
   - Autentikasi token kriptografis 256-bit (*Owner Token*) untuk menangkal kerentanan IDOR.
   - Deteksi tipe MIME berbasis tanda tangan biner asli (*magic bytes anti-spoofing*).
   - Sanitasi nama file dan penanganan khusus Windows file locking (`EBUSY`/`EPERM`).
   - Retensi otomatis 60 menit dan opsi hapus instan dari pengguna.
5. **Antarmuka Clean Light Mode Premium & Responsif**:
   - Desain terinspirasi standar industri Apple & Stripe (latar belakang bersih, bayangan bertingkat halus, border mikro, dan kartu bertekstur).
   - 3 Tab Navigasi Terpadu: "Konversi File", "Hapus Background", dan "Unduh Media Sosial".
   - Area drag-and-drop dan file picker dengan validasi ukuran instan.
   - Dynamic capabilities dropdown yang reaktif terhadap endpoint `/api/capabilities`.
   - Modal interaktif status engine dan katalog format.
   - Kepatuhan total terhadap Zero Emoji Policy dengan Lucide React icons.

---

## Teknologi

- **Frontend**: Next.js 14 App Router, React 18, TypeScript (Strict Mode), Tailwind CSS
- **Icon Utility**: Lucide React (Kepatuhan Zero Emoji)
- **Image Engine**: Sharp (libvips)
- **Testing**: Vitest 2.1 (Unit, Integration, Adversarial Stress Testing)
- **Linting & Code Quality**: ESLint 8.57, Prettier

---

## Panduan Memulai (Getting Started)

### 1. Prasyarat Sistem
- Node.js versi 18.18 atau lebih tinggi
- npm atau pnpm

### 2. Instalasi Dependensi
```bash
npm install
```

### 3. Konfigurasi Lingkungan
Salin file konfigurasi contoh:
```bash
cp .env.example .env.local
```

### 4. Menjalankan Server Pengembangan
```bash
npm run dev
```
Buka peramban di [http://localhost:3000](http://localhost:3000).

### 5. Menjalankan Rangkaian Uji Otomatis
```bash
# Menjalankan seluruh 107 test case (Unit, Integrasi, & Adversarial)
npm test

# Menjalankan typecheck TypeScript
npm run typecheck

# Menjalankan linter ESLint
npm run lint
```

### 6. Membangun untuk Produksi
```bash
npm run build
npm start
```

---

## Endpoint API

- `GET /api/health`: Informasi status layanan, uptime, platform, dan ketersediaan engine.
- `GET /api/capabilities?source={format}`: Daftar format target yang benar-benar didukung untuk format sumber yang diberikan.
- `POST /api/jobs`: Mengunggah berkas dan memulai pekerjaan konversi (mengembalikan `job` dan `ownerToken`).
- `GET /api/jobs/{id}`: Polling status dan metadata pekerjaan (memerlukan token otorisasi).
- `GET /api/jobs/{id}/download`: Mengunduh berkas keluaran pekerjaan yang berhasil (memerlukan token otorisasi).
- `DELETE /api/jobs/{id}`: Menghapus berkas dan riwayat pekerjaan secara permanen (memerlukan token otorisasi).
- `POST /api/background-removal`: Mengunggah gambar, melakukan matting adaptif anti-halo, dan mengganti latar belakang (transparan/solid/gradasi).
- `POST /api/downloader/extract`: Memvalidasi tautan media sosial dan mengekstrak metadata serta opsi kualitas video MP4 / audio MP3.
- `GET /api/downloader/download?url={url}&formatId={id}&title={title}`: Mengunduh aliran biner video MP4 atau audio MP3 dengan header unduhan yang tepat.

---

## Lisensi & Kepatuhan
Proyek FileVela dirancang untuk memenuhi standar rekayasa perangkat lunak enterprise dengan jaminan keamanan, privasi berkas pengguna, dan kode yang dapat dipelihara (*maintainable*). Berlisensi di bawah [Apache License 2.0](LICENSE).

