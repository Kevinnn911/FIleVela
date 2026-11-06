# PRD — Universal File Converter + Background Remover

**Versi:** 1.0  
**Tanggal:** 29 Oktober 2026  
**Status:** Draft untuk validasi produk

## 1. Ringkasan Produk

Aplikasi web untuk mengonversi file dari satu format ke format lain (contoh: PNG ke JPG, DOCX ke PDF, MP4 ke WEBM) melalui pengalaman sederhana: unggah file, pilih format tujuan, konversi, lalu unduh hasilnya. Aplikasi juga menyediakan fitur khusus untuk menghapus background gambar dan mengunduh hasil dengan latar transparan atau warna pilihan.

**Prinsip penting:** “Semua jenis file” adalah tujuan cakupan produk, bukan jaminan bahwa setiap pasangan format dapat dikonversi. Konversi hanya ditawarkan ketika ada konverter yang kompatibel dan hasilnya masuk akal. Format yang tidak didukung harus dijelaskan dengan jelas, bukan menghasilkan file rusak atau sekadar mengganti ekstensi.

## 2. Masalah Pengguna

- Pengguna harus berpindah-pindah situs untuk mengonversi format berbeda.
- Pengguna sering tidak tahu format keluaran yang cocok.
- Menghapus latar belakang gambar biasanya membutuhkan aplikasi tambahan.
- Pengguna membutuhkan alur yang cepat, jelas, dan aman untuk file pribadi.

## 3. Tujuan dan Indikator Keberhasilan

### Tujuan
1. Menyediakan satu antarmuka untuk banyak kategori format.
2. Membuat alur konversi mudah dipahami oleh pengguna nonteknis.
3. Menghapus background gambar dengan pratinjau sebelum mengunduh.
4. Menjaga keamanan, privasi, dan transparansi status pekerjaan.

### KPI awal
- Tingkat keberhasilan konversi untuk pasangan format yang didukung: ≥ 95%.
- Waktu hingga pengguna memulai konversi: median < 30 detik.
- Tingkat keberhasilan unduhan hasil: ≥ 98%.
- Tingkat kegagalan yang disebabkan format tidak didukung: dipantau dan ditampilkan secara transparan.
- Pengguna memahami kebijakan retensi file melalui pemberitahuan yang jelas.

## 4. Target Pengguna dan Use Case

- Pelajar/mahasiswa: DOCX ke PDF, gambar ke format web.
- Pekerja kantor: PDF, dokumen, spreadsheet, dan presentasi.
- Kreator konten: mengubah format gambar/video/audio dan menghapus background.
- Pengguna umum: konversi cepat tanpa perlu memasang aplikasi desktop.

Contoh alur:
1. Unggah `foto.png`, pilih JPG, atur kualitas, konversi, unduh.
2. Unggah foto produk, pilih **Hapus background**, tinjau hasil transparan, unduh PNG.
3. Unggah dokumen, pilih PDF jika pasangan format tersedia, lalu unduh.
4. Pilih format yang tidak didukung; aplikasi menjelaskan alasan dan alternatif yang tersedia.

## 5. Ruang Lingkup

### MVP
- Unggah file melalui tombol dan drag-and-drop.
- Deteksi jenis file berdasarkan isi/MIME bila memungkinkan, bukan ekstensi saja.
- Pemilihan format keluaran berdasarkan format sumber dan konverter yang tersedia.
- Antrean/status pekerjaan: menunggu, diproses, berhasil, gagal.
- Konversi satu file per pekerjaan; desain siap diperluas ke batch.
- Hapus background untuk gambar raster yang didukung.
- Pratinjau input dan hasil.
- Unduh hasil, hapus file/job secara manual, dan pesan error yang dapat ditindaklanjuti.
- Antarmuka responsif, aksesibel, dan berbahasa Indonesia.
- Batas ukuran file, timeout, rate limit, dan kebijakan retensi yang terlihat.

### Setelah MVP
- Konversi batch dan arsip ZIP.
- Akun dan riwayat pekerjaan.
- OCR, kompresi, penggabungan/pemisahan PDF.
- Pemrosesan video/audio berat dan format profesional.
- Integrasi penyimpanan cloud jika ada kebutuhan dan persetujuan privasi yang sesuai.

## 6. Format dan Matriks Konversi

Aplikasi harus menggunakan **registry kemampuan konverter** di backend. UI hanya menampilkan target yang benar-benar tersedia untuk input saat ini.

Kategori yang dapat dipertimbangkan, bergantung pada runtime dan lisensi:
- Gambar: PNG, JPG/JPEG, WebP, GIF, BMP, TIFF, SVG (dengan pembatasan keamanan), AVIF.
- Dokumen: PDF, DOCX, ODT, RTF, TXT, HTML.
- Spreadsheet: XLSX, ODS, CSV.
- Presentasi: PPTX, ODP, PDF.
- Audio: MP3, WAV, OGG, FLAC, AAC/M4A.
- Video: MP4, WEBM, MOV, MKV, GIF.
- Arsip: ZIP, TAR, GZ (arsip bukan konversi konten).
- Data/teks: JSON, XML, YAML, CSV, TXT, dengan validasi skema bila relevan.

Daftar ini bukan janji dukungan universal. Setiap pasangan format memerlukan adaptor/engine, validasi, pengujian, dan pemeriksaan lisensi. File executable, file terenkripsi, file rusak, format proprietary, serta konversi yang tidak bermakna tidak boleh dipaksakan.

## 7. Fitur Hapus Background

### Persyaratan
- Hanya aktif untuk tipe gambar yang didukung dan dapat diproses.
- Gunakan model/API segmentasi atau removal background yang legal dan terkonfigurasi di server; jangan mengarang hasil jika model tidak tersedia.
- Pertahankan tepi objek, rambut, dan detail halus sebisa mungkin.
- Tampilkan hasil di atas pola checkerboard untuk memperlihatkan transparansi.
- Opsi keluaran: PNG transparan; opsi warna latar solid jika implementasi mendukung.
- Pratinjau sebelum unduh, tombol unduh, coba lagi, dan kembali ke gambar asli.
- Beri label bahwa hasil otomatis dapat memerlukan penyuntingan lanjutan.
- Jika layanan AI tidak tersedia, tampilkan status tidak tersedia dan jangan mengklaim background sudah dihapus.

### Batasan
- MVP tidak perlu menyediakan editor mask manual.
- Tidak menjanjikan hasil sempurna pada objek yang tumpang tindih, transparan, atau memiliki warna mirip latar.
- Jangan mengubah gambar asli tanpa persetujuan; hasil adalah file baru.

## 8. Alur Pengguna

1. Pengguna membuka halaman utama.
2. Memilih **Konversi file** atau **Hapus background**.
3. Mengunggah file dan melihat nama, ukuran, serta tipe terdeteksi.
4. Untuk konversi: memilih format target yang didukung dan opsi yang relevan.
5. Menyetujui pemrosesan dan memulai pekerjaan.
6. Melihat progress/status dan pesan yang jelas.
7. Melihat pratinjau bila relevan, lalu mengunduh hasil.
8. File sumber dan hasil dihapus sesuai kebijakan retensi; pengguna dapat menghapus lebih awal.

## 9. Persyaratan Fungsional

- **FR-01 Upload:** menerima file melalui file picker dan drag-and-drop; validasi ukuran, tipe, dan jumlah.
- **FR-02 Detection:** verifikasi tipe file dengan signature/content inspection jika memungkinkan; jangan mempercayai ekstensi saja.
- **FR-03 Capability registry:** API mengembalikan format target yang tersedia untuk tipe sumber.
- **FR-04 Conversion:** backend menjalankan engine yang sesuai di lingkungan terisolasi dan memverifikasi output.
- **FR-05 Job status:** setiap job memiliki ID acak, status, waktu pembuatan, dan pesan error aman.
- **FR-06 Download:** hasil diunduh dengan nama file dan ekstensi yang benar; MIME sesuai isi.
- **FR-07 Background removal:** input gambar yang didukung dikirim ke engine yang terkonfigurasi, hasil ditinjau, lalu diunduh.
- **FR-08 Error handling:** jelaskan format tidak didukung, file rusak, batas ukuran, timeout, dan kegagalan engine.
- **FR-09 Cleanup:** hapus file sementara secara otomatis sesuai retensi dan saat diminta pengguna.
- **FR-10 Accessibility:** keyboard navigation, label kontrol, kontras memadai, status tidak hanya dibedakan dengan warna.
- **FR-11 Privacy:** tampilkan batas retensi, tujuan pemrosesan, dan apakah layanan pihak ketiga digunakan.
- **FR-12 Observability:** log metrik operasional tanpa mencatat isi file atau nama file sensitif secara default.

## 10. Persyaratan Nonfungsional

- **Keamanan:** validasi MIME dan signature, nama file di-normalisasi, antivirus/sandbox sesuai risiko, batas CPU/RAM/durasi, perlindungan SSRF/path traversal/zip bomb, isolasi proses, rate limiting.
- **Privasi:** HTTPS, akses file berbasis token acak berumur pendek, file privat, tidak ada URL publik yang dapat ditebak, kebijakan retensi yang jelas.
- **Reliabilitas:** pekerjaan berat berjalan di worker/queue; retry terbatas dan idempotent bila memungkinkan.
- **Performa:** unggah menampilkan progress; konversi asinkron untuk pekerjaan berat; jangan menjanjikan SLA sebelum pengukuran.
- **Kompatibilitas:** desktop dan mobile modern.
- **Aksesibilitas:** target WCAG 2.2 AA sejauh praktis.
- **Skalabilitas:** storage sementara dan worker dapat diskalakan terpisah.
- **Kepatuhan lisensi:** audit lisensi engine, codec, model AI, dan dependensi sebelum produksi.

## 11. Rekomendasi Arsitektur

- **Frontend:** Next.js/React + TypeScript, desain responsif, komponen aksesibel.
- **API:** Node.js/TypeScript atau backend setara.
- **Worker:** layanan terpisah untuk konversi dokumen/media, menggunakan engine yang sesuai (mis. LibreOffice headless untuk dokumen, FFmpeg untuk media, ImageMagick/libvips untuk gambar) setelah audit keamanan dan lisensi.
- **Background removal:** adaptor ke model lokal atau API provider yang disetujui; kunci API hanya di server.
- **Queue:** Redis/BullMQ atau sistem antrean setara untuk tugas asinkron.
- **Storage:** object storage privat dengan URL bertanda tangan berumur pendek; file sementara dienkripsi jika didukung.
- **Database:** PostgreSQL untuk metadata job, tanpa menyimpan konten file.
- **Deployment:** container non-root, filesystem sementara, resource limits, jaringan keluar dibatasi, worker terisolasi.

Arsitektur ini rekomendasi, bukan kewajiban teknologi. Pilihan akhir harus mengikuti kebutuhan biaya, hosting, keamanan, dan lisensi.

## 12. Model Data Minimal

**ConversionJob**
- `id`: UUID/ID acak
- `status`: queued | processing | succeeded | failed | expired
- `sourceFormat`, `targetFormat`
- `sourceSizeBytes`, `outputSizeBytes`
- `createdAt`, `expiresAt`
- `errorCode` (kode aman, bukan stack trace)
- `resultObjectKey` (internal/private)

**BackgroundRemovalJob**
- field job umum
- `operation`: remove-background
- `outputFormat`: PNG
- `provider`: nama provider/model tanpa rahasia
- `transparencySupported`: boolean

Jangan menyimpan file atau data pribadi lebih lama dari yang diperlukan.

## 13. API Awal (Contoh Kontrak)

- `GET /api/capabilities?source=png` → daftar target yang benar-benar didukung.
- `POST /api/jobs` → buat job; menerima file dan opsi tervalidasi.
- `GET /api/jobs/{id}` → status dan metadata yang aman.
- `GET /api/jobs/{id}/download` → unduhan hasil yang berizin dan belum kedaluwarsa.
- `DELETE /api/jobs/{id}` → hapus job dan file terkait.
- `POST /api/background-removal` → membuat job hapus background.
- `GET /api/health` → health check tanpa informasi sensitif.

Semua endpoint harus mengautentikasi/mengotorisasi akses job dengan token kepemilikan atau sesi yang aman. Jangan membuka job berdasarkan ID saja tanpa kontrol akses.

## 14. UI dan Konten

Halaman utama:
- Headline: “Konversi file dengan mudah”
- Deskripsi: “Ubah format file yang didukung atau hapus background gambar dalam beberapa langkah.”
- Dua pilihan utama: “Konversi file” dan “Hapus background”.
- Area drag-and-drop, batas ukuran yang dikonfigurasi, dan daftar tipe yang didukung.
- Pilihan format tujuan hanya setelah input dikenali.
- Progress, hasil, ukuran file, tombol unduh, hapus, dan coba lagi.
- Tautan kebijakan privasi dan retensi.

Gunakan bahasa Indonesia yang jelas. Hindari klaim “mendukung semua format” kecuali benar-benar dibuktikan untuk setiap format/pasangan. Gunakan “format yang didukung”.

## 15. Analitik dan Logging

Catat event operasional: `upload_started`, `upload_rejected`, `job_created`, `job_succeeded`, `job_failed`, `download_completed`, `background_removal_completed`. Hindari mengirim isi file, metadata sensitif, atau nama file mentah ke sistem analitik.

## 16. Kriteria Penerimaan

- Pengguna dapat mengunggah file yang memenuhi batas dan mendapat deteksi format yang masuk akal.
- Daftar format target hanya berisi konversi yang didukung registry.
- File yang tidak didukung ditolak dengan pesan ramah dan tidak hanya diganti ekstensi.
- Job menunjukkan status yang benar hingga berhasil/gagal.
- File hasil dapat diunduh, dapat dibuka, dan memiliki tipe konten/ekstensi yang sesuai.
- Hapus background menghasilkan PNG transparan pada input yang didukung; transparansi dapat diverifikasi pada checkerboard.
- Kegagalan provider background removal ditampilkan secara jujur.
- File sementara terhapus sesuai retensi dan tombol hapus berfungsi.
- File tidak dapat diakses pengguna lain hanya dengan menebak ID.
- UI berfungsi pada ukuran layar mobile dan desktop.
- Pengujian mencakup file rusak, ekstensi palsu, file terlalu besar, timeout, dan input berbahaya.

## 17. Risiko dan Mitigasi

- **Cakupan format terlalu luas:** mulai dengan matriks format yang teruji dan registry modular.
- **Konversi merusak format/layout:** validasi output, fixture tests, dan peringatan untuk konversi lossy.
- **Biaya komputasi tinggi:** kuota, batas ukuran, antrean, dan batas waktu.
- **File berbahaya:** isolasi worker, pembatasan resource, scanning sesuai risiko.
- **Privasi pihak ketiga:** jelaskan provider, lokasi pemrosesan, retensi, dan persetujuan bila dibutuhkan.
- **Lisensi codec/model:** lakukan audit legal dan lisensi sebelum rilis.

## 18. Keputusan yang Perlu Divalidasi

1. Batas ukuran file dan kuota per pengguna.
2. Apakah layanan tanpa akun atau memakai akun.
3. Engine/provider penghapus background dan biaya per pemrosesan.
4. Format prioritas untuk MVP.
5. Lama retensi file dan lokasi hosting.
6. Model bisnis: gratis, freemium, atau berbayar.
