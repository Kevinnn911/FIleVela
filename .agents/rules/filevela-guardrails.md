---
description: Guardrails performa scroll 60/120fps, pelestarian UI FileVela, dan keamanan pemrosesan berkas (PROMPT.md).
trigger: always_on
---

# FileVela Engineering & Security Guardrails

## 1. Pelestarian UI & Performa Scroll 60/120fps
1. **Jangan Mengubah UI Tanpa Instruksi**: Saat memperbaiki mekanisme scroll, performa, atau keamanan backend, dilarang mengubah desain, warna, tipografi, layout, atau menghapus informasi/komponen yang sudah ada.
2. **Zero-Reflow Scroll Loop**:
   - Jangan pernah memanggil `getBoundingClientRect()` atau `offsetHeight` di dalam handler `scroll` / `requestAnimationFrame`. Pisahkan pengukuran geometri ke fase `ResizeObserver` / `resize` dan simpan dalam cache ref.
   - Jangan pernah memperbarui state React numerik (`setScrollY(window.scrollY)`) pada setiap piksel scroll; gunakan ref boolean dengan ambang batas (threshold) agar komponen hanya re-render saat melewati batas state.
   - Jangan pernah memanggil `window.history.replaceState` di dalam loop scroll aktif.
   - Jangan menerapkan animasi `transform` / `scale` per-frame pada kontainer yang memiliki anak berefek `backdrop-filter: blur(...)`.

## 2. Standar Keamanan Pemrosesan Berkas (FileVela Security Baseline)
1. **Validasi Biner & Arsip**:
   - Selalu verifikasi signature *magic-bytes* (`verifyFileMime`) di server dan jangan pernah mempercayai ekstensi atau `Content-Type` dari klien.
   - Saat membaca arsip ZIP/OpenXML/ODF (`ZipReader`), batasi jumlah entri, ukuran dekompresi (`maxOutputLength`), rasio kompresi, dan tolak path yang mengandung `..`, awalan `/` atau `\`, drive letter, atau null byte.
2. **Isolasi Subproses & SSRF**:
   - Gunakan `execFile` (bukan shell string) dengan `timeout` eksplisit, allowlist opsi ketat, dan separator `--` sebelum argumen input/URL.
   - Jangan gunakan `--no-check-certificates` pada `yt-dlp`, dan selalu validasi host + resolusi DNS terhadap IP privat/loopback/metadata (`127.0.0.0/8`, `10.0.0.0/8`, `169.254.0.0/16`, `fc00::/7`).
3. **Header Unduhan Aman**:
   - Setiap respons unduhan berkas wajib menyertakan `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Content-Disposition: attachment` (RFC 5987), dan `Content-Security-Policy: default-src 'none'; sandbox`.

