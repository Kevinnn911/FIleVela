# Product Context — FileFlow

## Core Purpose
FileFlow adalah stasiun kerja pemrosesan berkas universal berbahasa Indonesia untuk konversi lintas format (35+ format dokumen, gambar, audio, video, dan data terstruktur), kompresi terukur (termasuk PDF, paket Office, gambar, serta video/audio FFmpeg), isolasi latar belakang pas foto resmi (KTP/Paspor), manipulasi struktur PDF (gabung hingga 60 dokumen & pisah rentang halaman), serta ekstraksi stream media publik tanpa watermark.

## Principles
1. **Zero Fake Conversions (Anti-Deception)**: Validasi signature biner (`magic-bytes`) ketat sebelum eksekusi. Format lawas biner yang engine-nya tidak tersedia ditolak secara jujur beserta alasan teknisnya.
2. **Dual Execution Model**:
   - **Sandbox Server Ephemeral**: Terisolasi per-job dengan otorisasi token kepemilikan SHA-256 dan pemusnahan otomatis maksimum 60 menit (TTL) serta tombol hapus instan.
   - **Mode Privasi Lokal (Browser)**: Eksekusi 100% di memori perangkat menggunakan Canvas API dan parser klien tanpa mengunggah satu byte pun ke jaringan.
3. **Batch Multi-Berkas Menyeluruh**: Antrian puluhan berkas sekaligus dengan pengemasan arsip `.ZIP` satu klik pada modul Konversi, Kompres, Hapus BG, dan Gabung PDF.

