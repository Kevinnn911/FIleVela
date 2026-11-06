# Panduan Lengkap Hosting FileVela di cPanel (`filevela.biz.id`)

Dokumen ini menjelaskan langkah demi langkah penyiapan dan deployment aplikasi **FileVela** pada layanan hosting berbasis **cPanel** (CloudLinux Node.js Selector / Phusion Passenger) menggunakan domain **`filevela.biz.id`**.

---

## 1. Persiapan Domain `filevela.biz.id` & Sertifikat SSL

1. **Arahkan Nameserver atau DNS Record**:
   - Pada panel registrar domain `.biz.id` Anda, arahkan Nameserver ke Nameserver hosting cPanel Anda, atau atur **Zone Editor** di cPanel:
     - **Type `A`** | Name: `filevela.biz.id.` | Value: `<IP_Server_cPanel_Anda>` | TTL: `3600`
     - **Type `CNAME`** | Name: `www.filevela.biz.id.` | Value: `filevela.biz.id.` | TTL: `3600`
2. **Tambahkan Domain di cPanel**:
   - Buka menu **Domains** di cPanel.
   - Pastikan **`filevela.biz.id`** terdaftar dan catat lokasi **Document Root**-nya (contoh: `/home/username/public_html` jika menjadi domain utama, atau `/home/username/filevela.biz.id` jika addon domain).
3. **Aktifkan SSL/TLS (HTTPS)**:
   - Buka menu **SSL/TLS Status** di cPanel.
   - Centang `filevela.biz.id` dan `www.filevela.biz.id`, lalu klik **Run AutoSSL** hingga berstatus hijau (AutoSSL Domain Validated).

---

## 2. Membangun Paket Produksi Siap-Unggah (`dist-cpanel`)

Pada shared hosting cPanel dengan batas RAM ketat (1 GB - 2 GB), proses `next build` sering terkendala batas memori CloudLinux LVE jika dijalankan langsung di server. Oleh karena itu, **sangat disarankan melakukan kompilasi di komputer lokal** terlebih dahulu:

1. Jalankan perintah berikut di terminal proyek lokal Anda:
   ```bash
   npm run build:cpanel
   ```
2. Perintah di atas akan mengompilasi produksi Next.js 14 dan membungkus seluruh berkas siap-unggah ke dalam folder **`dist-cpanel/`** yang berisi:
   - `.next/` (hasil build produksi tanpa cache webpack lokal yang berat)
   - `public/` (aset gambar, logo, dan favicon)
   - `server.js` & `app.js` (entrypoint resmi cPanel Phusion Passenger)
   - `next.config.mjs`
   - `package.json` & `package-lock.json`
   - `.env.production` (terkonfigurasi untuk `https://filevela.biz.id`)
   - `.htaccess.cpanel.example`
   - `.storage/jobs/` & `.storage/downloads/`
3. Kompres isi folder **`dist-cpanel/`** menjadi satu berkas arsip **`filevela-cpanel.zip`**.

---

## 3. Mengunggah Berkas ke cPanel

1. Buka **File Manager** di cPanel.
2. Buat folder aplikasi di luar atau di dalam home directory Anda, misalnya:
   ```text
   /home/<username_cpanel>/filevela-app
   ```
   *(Pastikan fitur **Show Hidden Files (dotfiles)** pada tombol **Settings** di pojok kanan atas File Manager cPanel sudah dicentang agar folder `.next`, `.storage`, dan `.env.production` terlihat).*
3. Unggah **`filevela-cpanel.zip`** ke dalam `/home/<username_cpanel>/filevela-app` dan klik kanan -> **Extract**.

---

## 4. Konfigurasi "Setup Node.js App" di cPanel

1. Buka menu **Software** -> **Setup Node.js App** di cPanel.
2. Klik tombol **Create Application** dan isi formulir sebagai berikut:
   - **Node.js version**: Pilih **`20.x`** (direkomendasikan) atau **`18.x`**.
   - **Application mode**: **`Production`**
   - **Application root**: `filevela-app` *(merujuk ke `/home/<username_cpanel>/filevela-app`)*
   - **Application URL**: Pilih domain **`filevela.biz.id`** dengan jalur kosong `/`
   - **Application startup file**: **`server.js`** *(atau `app.js` — keduanya telah disiapkan)*
3. Tambahkan **Environment Variables** (klik **Add Variable**):
   | Name | Value |
   | :--- | :--- |
   | `NODE_ENV` | `production` |
   | `NEXT_PUBLIC_SITE_DOMAIN` | `filevela.biz.id` |
   | `NEXT_PUBLIC_SITE_URL` | `https://filevela.biz.id` |
   | `NEXT_TELEMETRY_DISABLED` | `1` |
   | `STORAGE_DIR` | `.storage` |
   | `RETENTION_TTL_MINUTES` | `60` |
   | `MAX_FILE_SIZE_MB` | `50` |
4. Klik tombol **Create** di kanan atas.

---

## 5. Instalasi Dependensi Linux (Termasuk Binary `sharp` Linux x64)

Karena cPanel berjalan di atas sistem operasi **Linux x64** (CloudLinux / AlmaLinux), paket `node_modules` (khususnya engine pengolah gambar `sharp`) wajib diinstal di lingkungan Linux cPanel:

1. Pada halaman **Setup Node.js App** yang baru dibuat, klik tombol **Run NPM Install**; **ATAU**
2. Salin perintah `source /home/<username_cpanel>/nodevenv/filevela-app/20/bin/activate && cd /home/<username_cpanel>/filevela-app` yang tertera di bagian atas halaman Setup Node.js App, buka menu **Terminal** di cPanel, tempel perintah tersebut, lalu jalankan:
   ```bash
   npm install --omit=dev
   ```
3. Setelah instalasi selesai, kembali ke **Setup Node.js App** dan klik **Restart**.

---

## 6. Pengaturan `.htaccess` pada Document Root (`filevela.biz.id`)

Saat Anda membuat aplikasi di **Setup Node.js App**, cPanel secara otomatis menulis konfigurasi Phusion Passenger ke berkas `.htaccess` pada Document Root domain `filevela.biz.id`.

Buka berkas `.htaccess` tersebut melalui **File Manager** dan tambahkan aturan keamanan dari `.htaccess.cpanel.example` **di bawah** blok `# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION END`:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On

  # Blokir akses publik langsung ke direktori internal & penyimpanan sementara
  RewriteRule ^(?:\.storage|\.git|\.next|node_modules|src|tests)(?:/|$) - [F,L,NC]
  RewriteRule ^(?:\.env.*|package(?:-lock)?\.json|tsconfig\.json|vitest\.config\.ts)$ - [F,L,NC]

  # Paksa HTTPS dan redirect www.filevela.biz.id -> filevela.biz.id
  RewriteCond %{HTTPS} !=on [OR]
  RewriteCond %{HTTP_HOST} ^www\.filevela\.biz\.id$ [NC]
  RewriteRule ^ https://filevela.biz.id%{REQUEST_URI} [R=301,L]
</IfModule>

LimitRequestBody 57671680
Options -Indexes
```

---

## 7. (Opsional) Mengaktifkan `FFmpeg` & `yt-dlp` di cPanel Tanpa Akses Root

FileVela secara otomatis memindai folder `~/bin` dan `~/.local/bin` pada akun cPanel Anda. Jika server cPanel Anda belum menyediakan `ffmpeg` atau `yt-dlp` secara bawaan, Anda dapat memasangnya di ruang pengguna (`~/bin`) melalui **Terminal cPanel** tanpa memerlukan akses `root`:

```bash
mkdir -p ~/bin
cd ~/bin

# 1. Pasang FFmpeg & FFprobe statis Linux x64
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz
tar -xf ffmpeg.tar.xz --strip-components=1 --wildcards '*/ffmpeg' '*/ffprobe'
rm -f ffmpeg.tar.xz
chmod +x ~/bin/ffmpeg ~/bin/ffprobe

# 2. Pasang yt-dlp standalone Linux
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ~/bin/yt-dlp
chmod +x ~/bin/yt-dlp
```

Setelah menjalankan perintah di atas, klik **Restart** pada **Setup Node.js App** di cPanel.

---

## 8. Verifikasi Pasca-Deploy

1. Buka **`https://filevela.biz.id`** untuk memastikan halaman utama terbuka dengan gembok SSL aktif.
2. Buka **`https://filevela.biz.id/api/health`** untuk memeriksa status layanan (`"status": "healthy"`) serta daftar adapter yang aktif.
3. Buka **`https://filevela.biz.id/robots.txt`** dan **`https://filevela.biz.id/sitemap.xml`** untuk memastikan indeksasi domain `filevela.biz.id` berjalan normal.

