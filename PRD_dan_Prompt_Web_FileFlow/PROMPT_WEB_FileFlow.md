# Prompt Web App — Universal File Converter + Background Remover

Salin prompt ini ke AI coding tool pilihan Anda. Prompt ini meminta aplikasi web yang benar-benar terhubung ke backend, bukan sekadar mockup UI.

---

## PROMPT UTAMA

Bertindak sebagai **senior product designer, full-stack engineer, dan application security engineer**. Bangun aplikasi web production-minded bernama **FileFlow** dengan bahasa antarmuka Indonesia. Aplikasi digunakan untuk mengonversi file dari satu format ke format lain yang didukung dan menghapus background gambar.

### Tujuan produk
Buat UI modern, responsif, aksesibel, dan mudah dipakai. Pengguna dapat:
1. Mengunggah file lewat drag-and-drop atau file picker.
2. Melihat tipe file terdeteksi, ukuran, dan format keluaran yang benar-benar didukung.
3. Memilih format tujuan, menjalankan konversi, melihat status/progress, lalu mengunduh hasil.
4. Mengunggah gambar ke fitur **Hapus background**, melihat hasil pada checkerboard transparansi, lalu mengunduh PNG transparan.
5. Menghapus file/job dan memahami kapan file akan kedaluwarsa.

**Jangan mengklaim mendukung semua format secara universal.** Buat sistem adapter/registry yang hanya menawarkan pasangan konversi yang tersedia dan telah dikonfigurasi. Jangan pernah sekadar mengganti ekstensi file untuk berpura-pura mengonversi. Jika konverter atau layanan penghapus background belum dikonfigurasi, tampilkan status yang jujur dan instruksi setup; jangan membuat hasil palsu.

### Stack yang disarankan
- Frontend: Next.js, React, TypeScript.
- Styling: Tailwind CSS dan komponen aksesibel.
- Backend: route handlers/API server-side.
- Job berat: worker dan queue terpisah.
- Metadata: PostgreSQL atau adapter database yang terdokumentasi.
- File sementara: storage privat; jangan simpan file di folder publik.
- Konversi: adapter yang dapat diimplementasikan untuk engine seperti LibreOffice headless (dokumen), FFmpeg (audio/video), serta libvips/ImageMagick (gambar), setelah memeriksa lisensi dan mengisolasi proses.
- Background removal: adapter server-side untuk provider/model yang dikonfigurasi melalui environment variable. Rahasia API hanya di server.
- Bila stack atau lingkungan eksekusi tidak mendukung semua layanan tersebut, buat interface adapter, implementasi yang aman untuk subset yang benar-benar berjalan, serta dokumentasikan cara mengaktifkan adapter lain.

### Desain UI
Gunakan desain bersih dan profesional: latar netral, tipografi jelas, jarak lapang, kartu sederhana, aksen warna secukupnya, state hover/focus yang jelas. Jangan terlalu banyak gradient atau ornamen.

Halaman utama:
- Logo/wordmark “FileFlow”.
- Navigasi: “Konversi file”, “Hapus background”, “Format didukung”.
- Headline: **“Semua kebutuhan file, di satu tempat.”**
- Subheadline: “Konversi format yang didukung dan hapus background gambar dengan alur sederhana.”
- Dua tab/kartu mode: “Konversi file” dan “Hapus background”.
- Area upload besar dengan ikon upload, teks “Seret file ke sini atau pilih file”, batas ukuran yang dikonfigurasi, dan daftar tipe yang didukung.
- Setelah upload: nama file, ukuran, format terdeteksi, tombol ganti file/hapus.
- Mode konversi: dropdown format tujuan yang diisi dari API capabilities, opsi spesifik format jika relevan, tombol “Konversi”.
- Mode hapus background: jelaskan bahwa fitur bekerja pada gambar yang didukung; tombol “Hapus background”.
- Panel status job: menunggu, diproses, berhasil, gagal; progress hanya jika backend benar-benar menyediakan nilai progress.
- Panel hasil: pratinjau, format/ukuran hasil, tombol “Unduh hasil”, “Proses file lain”, dan “Hapus file”.
- Tampilkan error yang jelas dan dapat ditindaklanjuti.
- Footer: kebijakan privasi, retensi file, format didukung.

### Fungsionalitas wajib
1. **Upload**
   - Drag-and-drop dan file picker.
   - Validasi ukuran, tipe, dan ekstensi di klien untuk UX, lalu validasi ulang di server.
   - Jangan percaya `Content-Type` atau ekstensi saja; lakukan pemeriksaan konten/signature bila memungkinkan.
   - Nama file harus dinormalisasi dan tidak boleh digunakan sebagai path.
2. **Capability registry**
   - Endpoint seperti `GET /api/capabilities?source=png`.
   - UI hanya menampilkan target format yang benar-benar didukung adapter yang aktif.
   - Dokumentasikan pasangan format yang diuji.
3. **Konversi**
   - Endpoint membuat job asinkron untuk pekerjaan berat.
   - Validasi output, MIME, ukuran, dan ekstensi sebelum mengizinkan download.
   - Tangani file rusak, format tidak didukung, timeout, kegagalan engine, dan output kosong.
   - Jangan menjalankan shell command dengan input pengguna yang disisipkan langsung. Gunakan argumen terstruktur, escaping yang benar, dan proses terisolasi.
4. **Hapus background**
   - Endpoint job khusus, misalnya `POST /api/background-removal`.
   - Hasil default PNG transparan.
   - Tampilkan hasil di atas checkerboard agar transparansi tampak.
   - Jangan klaim sukses jika provider gagal atau belum diatur.
   - Provider/model dipanggil dari server, bukan langsung dari browser jika memerlukan secret.
5. **Status dan unduhan**
   - `GET /api/jobs/{id}` untuk status.
   - `GET /api/jobs/{id}/download` untuk file hasil.
   - `DELETE /api/jobs/{id}` untuk menghapus job dan file terkait.
   - Lindungi akses job menggunakan sesi/token kepemilikan yang aman; ID acak saja bukan otorisasi.
   - Gunakan URL bertanda tangan berumur pendek bila memakai object storage.
6. **Privasi dan cleanup**
   - File disimpan secara privat, dengan waktu kedaluwarsa yang jelas.
   - Hapus file sementara otomatis setelah retensi yang dikonfigurasi.
   - Sediakan tindakan hapus manual.
   - Jangan log isi file, token, atau nama file sensitif secara default.
   - Beri tahu pengguna jika file diproses oleh layanan pihak ketiga.
7. **Aksesibilitas**
   - Semua kontrol dapat digunakan dengan keyboard.
   - Label dan pesan error terhubung ke kontrol.
   - Status tidak disampaikan melalui warna saja.
   - Gunakan kontras yang baik dan hormati reduced motion.
8. **Keamanan**
   - Batas ukuran, rate limit, timeout, pembatasan CPU/RAM, isolasi worker, dan validasi input.
   - Mitigasi path traversal, SSRF, zip bomb, file polyglot, dan file berbahaya sesuai threat model.
   - Worker non-root, filesystem sementara, dan jaringan keluar dibatasi jika memungkinkan.
   - Jangan membuka file hasil secara publik atau dengan URL yang mudah ditebak.

### Kontrak API awal
- `GET /api/capabilities?source={format}` → format target dan opsi yang tersedia.
- `POST /api/jobs` → menerima file + format tujuan + opsi yang tervalidasi.
- `POST /api/background-removal` → menerima gambar + opsi keluaran.
- `GET /api/jobs/{id}` → status job yang aman.
- `GET /api/jobs/{id}/download` → unduhan yang terotorisasi.
- `DELETE /api/jobs/{id}` → hapus job dan aset terkait.
- `GET /api/health` → health check tanpa data sensitif.

### Kualitas implementasi
- Buat struktur folder yang jelas dan komponen reusable.
- Gunakan TypeScript dengan tipe yang ketat.
- Buat loading, empty, success, dan error states.
- Jangan gunakan tombol palsu atau interaksi yang hanya mengubah tampilan tanpa aksi nyata.
- Sertakan validasi server-side dan pesan error yang aman.
- Tambahkan unit test untuk registry, validasi file, transisi status job, serta API; tambahkan integration test untuk satu konversi yang benar-benar dapat dijalankan di lingkungan target.
- Jika suatu engine eksternal tidak terpasang, jangan membuat implementasi seolah-olah berfungsi. Tampilkan error konfigurasi yang jelas.
- Jangan menanamkan secret ke kode frontend atau repository.
- Jangan memasukkan file pengguna ke analytics/log.

### Output yang harus diberikan
1. Source code aplikasi lengkap dan terstruktur.
2. README dengan langkah instalasi dan menjalankan secara lokal.
3. `.env.example` tanpa secret asli.
4. Dokumentasi adapter/engine dan pasangan format yang didukung.
5. Instruksi setup worker/queue/storage/database.
6. Daftar keterbatasan yang diketahui.
7. Test otomatis untuk fitur inti.
8. Checklist deployment dan keamanan.

### Kriteria selesai
- Aplikasi dapat dijalankan mengikuti README.
- Upload dan validasi berfungsi.
- Format tujuan berasal dari registry aktif, bukan daftar klaim statis.
- Minimal satu pasangan konversi end-to-end benar-benar bekerja pada lingkungan target dan dites.
- Fitur hapus background benar-benar memanggil adapter terkonfigurasi; jika belum tersedia, UI menjelaskan setup yang dibutuhkan dan tidak membuat hasil palsu.
- Hasil unduhan dapat dibuka dan memiliki tipe yang sesuai.
- File pribadi tidak dapat diakses tanpa otorisasi.
- Error dan status ditampilkan dengan jujur.
- Tampilan nyaman di mobile dan desktop.

Mulai dengan memeriksa kemampuan runtime dan dependency yang tersedia. Setelah itu implementasikan MVP end-to-end untuk subset format yang benar-benar bisa dijalankan, kemudian dokumentasikan cara menambahkan adapter format lainnya. Jangan hanya membuat landing page atau mockup.
