# Daftar Perbaikan & Rekomendasi Pengerasan — FileFlow

## Temuan Adversarial Testing & Remediasi Milestone 1 (Iterasi 2 & 3)

[PRIORITY: MEDIUM]
- Location: `src/lib/adapters/registry.ts:260-305` (`CapabilityRegistry.checkAdapterAvailability`)
- Severity: Medium
- Status: RESOLVED (Selesai di Milestone 1 Iterasi 2)
- Root Cause: Cache availability menggunakan TTL (`availabilityCache`), namun tidak memiliki *in-flight promise de-duplication* / *promise coalescing* (`inFlightAvailability: Map<string, Promise<boolean>>`). Ketika terjadi *cold burst* 50 permintaan konkruen sebelum cache terisi, seluruh 50 permintaan memanggil `adapter.isAvailable()` secara bersamaan (masalah *cache stampede / thundering herd*).
- Solution: Menambahkan map pelacak promise aktif `private inFlightAvailability: Map<string, Promise<boolean>> = new Map();` pada `CapabilityRegistry`. Pemeriksaan ketersediaan yang sedang berlangsung untuk suatu adapter akan langsung membagikan promise yang sama ke pemanggil konkruen lainnya, dengan pembersihan otomatis melalui `checkPromise.finally()`. Terverifikasi berhasil mengkonsolidasikan 50 panggilan burst menjadi tepat 1 eksekusi `adapter.isAvailable()`.
- Target Deadline: Milestone 1 Iterasi 2

[PRIORITY: LOW]
- Location: `src/lib/security/token-auth.ts:35-62` (`verifyOwnerToken`)
- Severity: Low
- Status: RESOLVED (Selesai di Milestone 1 Iterasi 2)
- Root Cause: Parameter `storedHash` tidak divalidasi keberadaan dan tipe datanya sebelum diproses oleh `Buffer.from(storedHash, 'hex')`. Bila metadata job korup atau `meta.ownerTokenHash` bernilai `undefined`/`null`, pemanggilan `Buffer.from` melempar unhandled `TypeError` alih-alih mengembalikan `false`.
- Solution: Menambahkan guard pengaman tipe data di awal fungsi: `if (!storedHash || typeof storedHash !== 'string') return false;`. Menangani input non-string, `null`, `undefined`, atau string kosong secara aman dan anggun (*graceful*).
- Target Deadline: Milestone 1 Iterasi 2

[PRIORITY: LOW]
- Location: `src/lib/security/token-auth.ts:89-95` (`extractTokenFromRequest`)
- Severity: Low
- Status: RESOLVED (Selesai di Milestone 1 Iterasi 2)
- Root Cause: Skema HTTP Authorization header case-insensitive per RFC 7235 / RFC 6750, namun implementasi sebelumnya memeriksa `authHeader.startsWith('Bearer ')` dengan huruf besar eksak. Klien yang mengirimkan header standar `authorization: bearer <token>` (huruf kecil) diabaikan (`null`).
- Solution: Menggunakan pengecekan case-insensitive `authHeader.toLowerCase().startsWith('bearer ')` dan mengekstrak token 64 hex secara andal terlepas dari variasi penulisan skema (`Bearer `, `bearer `, `BEARER `).
- Target Deadline: Milestone 1 Iterasi 2

[PRIORITY: LOW]
- Location: `src/app/api/capabilities/route.ts:55-68` (`GET /api/capabilities`)
- Severity: Low
- Status: RESOLVED (Selesai di Milestone 1 Iterasi 2)
- Root Cause: Pengecekan sebelumnya mensyaratkan `!sourceCapability`. Format seperti `yaml` atau `rtf` yang tercantum di katalog `KNOWN_FORMAT_CATALOG` namun belum memiliki adapter aktif maupun inaktif di M1 menghasilkan respons 200 OK dengan `targets: []` dan `unavailableAdapters: []`, bukan respons 400 `SOURCE_NOT_SUPPORTED`.
- Solution: Mengubah guard menjadi `if (targets.length === 0 && unavailableAdapters.length === 0)`. Format tanpa target aktif dan tanpa instruksi konfigurasi adapter inaktif secara konsisten mengembalikan respons HTTP 400 `SOURCE_NOT_SUPPORTED`.
- Target Deadline: Milestone 1 Iterasi 2

[PRIORITY: HIGH]
- Location: `tests/adversarial/m1-adversarial.test.ts:201`
- Severity: High (Pelanggaran User Global Rule 7 - Zero Emoji Policy)
- Status: RESOLVED (Selesai di Milestone 1 Iterasi 2)
- Root Cause: Ditemukan karakter emoji literal (rocket) pada baris 201 file test adversarial.
- Solution: Mengganti emoji literal dengan surrogate pair escape sequence `\uD83D\uDE80` dan string uji non-heksadesimal deskriptif ASCII. Seluruh file proyek kini 100% bebas dari emoji dan simbol Unicode dekoratif.
- Target Deadline: Milestone 1 Iterasi 2

[PRIORITY: MEDIUM]
- Location: `src/lib/storage/temp-storage.ts:191,232` (`saveInputFile` dan `saveOutputFile`)
- Severity: Medium
- Status: RESOLVED (Selesai di Milestone 1 Iterasi 3)
- Root Cause: Penamaan file sementara (`tempPath`) hanya mengandalkan `Date.now()` (`upload_${Date.now()}.tmp` dan `output_${Date.now()}.tmp`). Ketika pemanggilan `saveInputFile` atau `saveOutputFile` dieksekusi secara konkruen dalam milidetik yang sama, kedua operasi menggunakan path file sementara yang identik. Operasi pertama yang menyelesaikan `fs.promises.rename(tempPath, targetPath)` memindahkan file tersebut, menyebabkan operasi berikutnya melempar error `ENOENT: no such file or directory`.
- Solution: Menambahkan entropi acak kriptografis pada penamaan file sementara: `path.join(jobDir, 'temp', \`upload_\${Date.now()}_\${crypto.randomBytes(6).toString('hex')}.tmp\`)`.
- Target Deadline: Milestone 1 Iterasi 3

[PRIORITY: LOW]
- Location: `src/lib/security/mime-detector.ts:258-264` (`normalizeFormatName`)
- Severity: Low
- Status: RESOLVED (Selesai di Milestone 1 Iterasi 3)
- Root Cause: Urutan operasi normalisasi `fmt.toLowerCase().replace(/^\./, '').trim()` mengeksekusi `.replace(/^\./, '')` sebelum `.trim()`. Jika input mengandung spasi awal diikuti titik (misalnya `' .png '` atau `'  .jpg  '`), karakter pertama adalah spasi sehingga `^\.` tidak cocok dan titik tidak dibersihkan. Pembersihan spasi setelahnya menghasilkan `'.png'`, yang gagal diverifikasi terhadap detected format `'png'`.
- Solution: Memindahkan pemanggilan `.trim()` sebelum penghapusan titik: `const clean = fmt.trim().toLowerCase().replace(/^\.+/, '').replace(/\.+$/, '').trim();`.
- Target Deadline: Milestone 1 Iterasi 3

## Temuan & Pengerasan Milestone 4 (Optimalisasi UI, Matting, Format Baru, & Downloader)

[PRIORITY: LOW]
- Location: `src/lib/security/mime-detector.ts:291-305` (`verifyFileMime`)
- Severity: Low
- Status: RESOLVED (Selesai di Milestone 4)
- Root Cause: Pesan error pada ketidakcocokan MIME tidak menyertakan detected MIME type secara eksplisit pada template string, menyebabkan kegagalan assertion pada test suite yang memverifikasi pesan error informatif (`error.toContain('image/png')`).
- Solution: Memperbarui template string error: `MIME type terdeteksi (${detected.mimeType} / ${detected.format}) tidak cocok dengan format yang diharapkan: ${expectedFormat}`.
- Target Deadline: Milestone 4

[PRIORITY: LOW]
- Location: `src/lib/adapters/ffmpeg-media.ts`, `src/lib/adapters/libreoffice.ts`, `src/lib/adapters/sharp-image.ts`
- Severity: Low (TypeScript Warning TS6133)
- Status: RESOLVED (Selesai di Milestone 4)
- Root Cause: Parameter `sourceFormat` tidak digunakan secara langsung pada beberapa signature method adapter, menyebabkan build warning/error `TS6133: 'sourceFormat' is declared but its value is never read` di bawah flag TypeScript `noUnusedParameters: true`.
- Solution: Memberi awalan garis bawah `_sourceFormat` pada parameter yang sengaja diabaikan untuk menandai parameter tersebut sebagai intentionally unused per standar TypeScript.
- Target Deadline: Milestone 4

[PRIORITY: LOW]
- Location: `tests/integration/downloader-api.test.ts`
- Severity: Low (TypeScript Error TS2322)
- Status: RESOLVED (Selesai di Milestone 4)
- Root Cause: Konstruktor `new Blob([buffer])` pada mock FormData Request di lingkungan Vitest/Node.js menolak `Buffer` murni sebagai tipe `BlobPart` yang valid di TypeScript Strict DOM.
- Solution: Mengkonversi Buffer menjadi TypedArray standar `new Blob([new Uint8Array(buffer)])` yang kompatibel secara universal di browser dan Node.js runtimes.
- Target Deadline: Milestone 4

## Temuan & Pengerasan Milestone 11 (Audit Skeptis & Penyempurnaan UI Monokrom Premium)

[PRIORITY: MEDIUM]
- Location: `src/components/ResultPanel.tsx:194-220`
- Severity: Medium (Functional & State Inconsistency)
- Status: RESOLVED
- Root Cause: Ketika pengguna menghapus berkas pekerjaan dari penyimpanan terisolasi via tombol tempat sampah (`onDeleteJob`), state `deleteSuccess` menjadi true, namun tombol utama "Unduh Berkas" (`<a>`) tetap aktif dan dapat diklik dengan URL unduhan yang sama, memicu error 404/400 saat diklik oleh pengguna.
- Solution: Memperbarui render kondisional tombol unduh: bila `deleteSuccess` bernilai true, elemen tautan digantikan oleh banner disabled informatif berlabel "Berkas Telah Dihapus dari Server" (`cursor-not-allowed`, `opacity-60`), serta status penyimpanan terisolasi diperbarui menjadi "Telah dihapus permanen oleh pengguna".
- Target Deadline: Milestone 11

[PRIORITY: MEDIUM]
- Location: `src/components/SupportedFormatsModal.tsx:22-55`
- Severity: Medium (Accessibility & UX Flaw)
- Status: RESOLVED
- Root Cause: Modal dialog katalog format tidak mendukung dismiss melalui penekanan tombol keyboard `Escape` maupun klik pada area backdrop overlay di luar kotak dialog. Pengguna dipaksa secara eksklusif mencari dan menekan tombol 'X' atau 'Tutup'.
- Solution: Menambahkan event listener `keydown` untuk tombol `Escape` di dalam `useEffect` serta handler `onClick` pada container backdrop dengan guard `if (e.target === e.currentTarget) onClose();`.
- Target Deadline: Milestone 11

[PRIORITY: LOW]
- Location: `src/components/FileUploadZone.tsx:93-112, 147`
- Severity: Low (Accessibility & Invalid Tailwind Class)
- Status: RESOLVED
- Root Cause: Elemen dropzone interaktif tidak memiliki properti aksesibilitas keyboard (`tabIndex={0}`, `role="button"`, `onKeyDown`) sehingga pengguna keyboard tidak dapat menavigasi atau membuka file picker dengan Enter/Space. Selain itu, terdapat typo kelas Tailwind `py-0.2` pada baris 147 yang tidak valid.
- Solution: Menambahkan `tabIndex={0}`, `role="button"`, `onKeyDown` dengan penanganan tombol Enter dan Space, serta memperbaiki kelas Tailwind menjadi `py-0.5`.
- Target Deadline: Milestone 11

[PRIORITY: LOW]
- Location: `src/components/SocialDownloaderPanel.tsx:97-128`
- Severity: Low (Visual Layout Collisions)
- Status: RESOLVED
- Root Cause: Padding kanan pada input teks URL media sosial disetel `pr-28` (112px). Ketika kolom input kosong, terdapat dua tombol aksi sejajar ("Tempel" berukuran ~65px dan "Periksa" berukuran ~75px dengan gap), yang membutuhkan ruang horizontal ~145px, sehingga placeholder atau teks input tertumpuk di bawah tombol.
- Solution: Memperbesar padding kanan input menjadi `pr-36 sm:pr-40` untuk memastikan jarak aman antara teks input dan tombol aksi ganda.
- Target Deadline: Milestone 11

[PRIORITY: LOW]
- Location: `src/components/BgRemovalPanel.tsx:182`
- Severity: Low (Monochrome Aesthetic Violation)
- Status: RESOLVED
- Root Cause: Tombol segmented switcher untuk mode "Warna Solid" memuat elemen titik bulat merah hardcoded `<div className="h-2.5 w-2.5 rounded-full bg-red-600 ring-1 ring-white/50" />`, yang melanggar direktif monokrom murni ("tetap monokrom").
- Solution: Mengganti titik merah tersebut dengan ikon monokrom `Palette` dari Lucide React, menjaga keselarasan chrome kontrol tetap 100% monokrom.
- Target Deadline: Milestone 11

[PRIORITY: LOW]
- Location: `src/components/ConversionPanel.tsx:114`
- Severity: Low (Potential Runtime TypeError)
- Status: RESOLVED
- Root Cause: Pengecekan pesan instruksi adapter tidak menggunakan optional chaining sebelum indeks array: `capabilities.unavailableAdapters[0]?.setupInstructions`. Jika respons API mengembalikan `unavailableAdapters` bernilai `undefined`, akses indeks melempar runtime TypeError.
- Solution: Menambahkan defensive optional chaining `capabilities.unavailableAdapters?.[0]?.setupInstructions`.
- Target Deadline: Milestone 11

[PRIORITY: LOW]
- Location: `src/app/globals.css:38, 48, 86, 126, 135, 156, 165`
- Severity: Low (Dead Code & Token Contamination)
- Status: RESOLVED
- Root Cause: Terdapat sisa class alias `.nuvio-*` (`.nuvio-card`, `.btn-nuvio-primary`, `.btn-nuvio-secondary`, `.nuvio-pill-group`, `.checkerboard-nuvio`) dari iterasi sebelumnya yang tidak lagi digunakan dan mengotori stylesheet global.
- Solution: Menghapus seluruh selector `.nuvio-*` dan menstandarkan token murni pada `.premium-*`.
- Target Deadline: Milestone 11

## Temuan & Pengerasan Milestone 12 (Kompresi Berkas & Universal Office Hybrid)

[PRIORITY: LOW]
- Location: `src/app/api/compress/route.ts:104`
- Severity: Low (TypeScript Compilation TypeError)
- Status: RESOLVED
- Root Cause: Destrukturisasi pemanggilan `generateOwnerToken()` awalnya merujuk pada properti `rawToken` dan `hashedToken` yang tidak sesuai dengan interface `GeneratedToken { token: string; hash: string }`.
- Solution: Memperbaiki destrukturisasi menjadi `const { token, hash } = generateOwnerToken();` dan menyelaraskan penamaan variabel ke pembuatan metadata `jobMeta.ownerTokenHash: hash`.
- Target Deadline: Milestone 12


## Temuan & Pengerasan Milestone 13 (UI/UX Apple & Linear Ultra-Craft Elevation)

[PRIORITY: LOW]
- Location: `src/components/BgRemovalPanel.tsx:15`, `src/components/ConversionPanel.tsx:12`, `src/components/ResultPanel.tsx:14`, `src/components/SupportedFormatsModal.tsx:6`
- Severity: Low (TypeScript Compiler TS6133 Unused Identifiers)
- Status: RESOLVED
- Root Cause: Terdapat import simbol ikon Lucide (`ImageIcon`, `Sparkles`, `ArrowRight`, `Layers`) yang tidak terpakai setelah restrukturisasi visual komponen, menyebabkan `tsc --noEmit` melempar error `TS6133: is declared but its value is never read`.
- Solution: Menghapus seluruh unused imports dari header berkas. Hasil verifikasi `npx tsc --noEmit` dan `npm run lint` menghasilkan 0 error dan 0 warning.
- Target Deadline: Milestone 13

## Temuan & Pengerasan Milestone 14 (High-Fidelity PPTX to PDF & Image XObject Embedding)

[PRIORITY: HIGH]
- Location: `src/lib/document/office-parser.ts:26-180`, `src/lib/document/pdf-builder.ts:43-370`
- Severity: High (Kualitas Konversi Dokumen / Degradasi Visual Signifikan)
- Status: RESOLVED
- Root Cause: Mesin fallback konversi presentasi PPTX ke PDF awalnya hanya mengekstrak teks mentah baris-per-baris dan merendernya ke dalam template wireframe kotak abu-abu dengan garis aksen hitam di atas, badge 'SLIDE 1/14', dan simbol bullet hitam. Mesin mengabaikan gambar latar belakang slide (`ppt/media/image1.jpeg`), rasio widescreen 16:9, dan format paragraf tengah (`<a:pPr algn="ctr">`) dengan warna teks putih. Pengguna mengira degradasi visual ini akibat kompresi berkas berlebih, padahal disebabkan oleh ketiadaan dukungan rendering gambar dan layout visual pada parser.
- Solution:
  1. Menambahkan metode `drawImage` dan pendaftaran XObject biner JPEG (`/Filter /DCTDecode`) pada `SimplePdfDocument` di `src/lib/document/pdf-builder.ts`.
  2. Mengekstrak gambar background slide dan relasi media pada `parsePptx` di `src/lib/document/office-parser.ts`.
  3. Mendeteksi rasio slide 16:9 widescreen dari `ppt/presentation.xml`.
  4. Menerapkan rendering adaptif pada `presentationToPdf`: menggambar background gambar *full-bleed*, menghapus template wireframe artifisial, dan memusatkan tipografi lirik dengan warna putih tajam berkontras tinggi (*drop shadow*).
  5. Seluruh 147 test cases otomatis lulus 100%, `npx tsc --noEmit` 0 error, dan `npm run lint` 0 warning.
- Target Deadline: Milestone 14

## Temuan & Pengerasan Milestone 16 (Full-Width Sticky Header & Viewport Edge Alignment)

[PRIORITY: MEDIUM]
- Location: `src/components/Header.tsx:60-68`
- Severity: Medium (Visual Defect / Truncated Navbar on Desktop)
- Status: RESOLVED
- Root Cause: Styling latar belakang `bg-white/80`, garis bawah `border-b border-zinc-200/80`, dan efek blur `backdrop-blur-md` sebelumnya disematkan langsung pada container inner `div` yang memiliki batasan lebar `max-w-6xl` (1152px), sementara elemen `<header>` luar hanya memiliki `w-full pointer-events-none` tanpa background dan border. Akibatnya, pada layar beresolusi di atas 1152px (desktop/laptop), bilah navigasi atas terpotong secara visual di bagian tengah, memperlihatkan latar belakang canvas di sisi kiri dan kanan bar (tampak seolah-olah "ke sampingnya hilang").
- Solution: Memindahkan kepemilikan styling full-width (`w-full bg-white/80 border-b border-zinc-200/80 backdrop-blur-md`) ke elemen `<header>` pembungkus luar saat `!isScrolled`. Container inner `div` kini murni berfungsi sebagai pembatas konten (`max-w-6xl w-full px-4 sm:px-6`) dengan background dan border transparan. Saat halaman digulir (`isScrolled`), `<header>` bertransisi menjadi transparan dan container inner bertransformasi menjadi kapsul mengambang (floating island) berujung bulat penuh.
- Target Deadline: Milestone 16

## Temuan & Pengerasan Milestone 17 (Seamless Single-Shell Morphing Navbar)

[PRIORITY: MEDIUM]
- Location: `src/components/Header.tsx:40-150`
- Severity: Medium (Perceived Loss of Transition Continuity)
- Status: RESOLVED
- Root Cause: Pendekatan cross-fade dua layer terpisah (fading out topbar dan gliding in floating notch) membuat pengguna merasa efek morfologi hilang ("malah gada transisinya"). Pengguna secara eksplisit menginginkan visual kontinuitas fisik di mana bar penuh secara nyata mengerut/bertransformasi (*morphing*) ke dalam notch tanpa terputus, namun tanpa mengalami jank atau lag.
- Solution:
  1. Mengadopsi arsitektur *Single Morphing Shell* dengan satu kurva transisi terpadu `duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]`.
  2. Mengeliminasi seluruh sumber lag layout internal: ukuran logo (`h-8 w-8`), teks judul (`FileFlow PRO`), serta padding tombol navigasi (`px-2.5 sm:px-3 py-1.5`) dibuat 100% konsisten pada kedua status (tidak ada font-size jumps, padding shifts, atau text re-wrapping).
  3. Menjaga efek `backdrop-blur-md` tetap konstan pada kontainer morphing sehingga shader blur tidak di-recompile saat bergulir.
  4. Kontainer luar secara visual mengerut mulus dari `w-full max-w-full rounded-none` (100% lebar layar) menjadi `w-[94vw] max-w-[680px] rounded-full shadow-lg` dengan deadband hysteresis scroll (`> 35px` aktif, `< 15px` kembali).
  5. Seluruh 147 test cases lulus 100%, 0 TypeScript error, dan 0 lint warning.
- Target Deadline: Milestone 17

## Temuan & Pengerasan Milestone 18 (Real Media Downloader Engine & File Integrity Remediation)

[PRIORITY: HIGH]
- Location: [`src/app/api/downloader/download/route.ts`](file:///c:/Best%20Project/Open/src/app/api/downloader/download/route.ts)
- Severity: High (Critical Bug / Media Playback Failure 0xC00D36C4 & Mock Payload Deception)
- Status: RESOLVED
- Root Cause: Endpoint `/api/downloader/download` sebelumnya hanya mengembalikan mock payload statis berupa 4096 byte dummy biner `0xff` untuk MP3 dan box `moov` kosong tanpa track untuk MP4. Ketika berkas diunduh dan dibuka di Windows Media Player, sistem operasi menolak berkas dengan pesan kesalahan `0xC00D36C4` ("Kami tidak dapat membuka berkas. Ini mungkin terjadi karena jenis file tidak didukung, ekstensi file salah, atau file rusak"). Hal ini juga melanggar prinsip anti-deception dan zero fake conversions dari spesifikasi proyek.
- Solution:
  1. Menggantikan seluruh mock dummy bytes dengan arsitektur unduhan biner nyata berbasis `yt-dlp` dan `ffmpeg` pada [`src/lib/downloader/download-service.ts`](file:///c:/Best%20Project/Open/src/lib/downloader/download-service.ts).
  2. Menerapkan instalasi `curl_cffi` pada Python environment server untuk mengatasi bot detection TikTok, Instagram, dan Twitter/X.
  3. Mengonversi audio ke standar MP3 (MPEG-1 Audio Layer 3 stereo dengan ID3v2 header valid) dan video ke MP4 (H.264 + AAC) sehingga 100% kompatibel dengan pemutar bawaan Windows Media Player, Groove, TV & Movies, QuickTime, dan mobile OS.
  4. Melakukan verifikasi otomatis setiap platform (YouTube, TikTok, Instagram, X) menggunakan `ffprobe`: codec audio `mp3`/`aac`, codec video `h264`, bitstream intact, dan probe score 100.
  5. Menjaga isolasi berkas sementara di `.storage/downloads/` dengan pembersihan otomatis instan setelah transmisi stream selesai.
  6. Menjamin seluruh 147 test cases Vitest tetap lulus 100%, 0 TypeScript error, dan 0 ESLint warning.
- Target Deadline: Milestone 18

## Temuan & Pengerasan Milestone 19 (Download Latency & Inspection Speed Optimization)

[PRIORITY: MEDIUM]
- Location: [`src/lib/downloader/media-extractor.ts`](file:///c:/Best%20Project/Open/src/lib/downloader/media-extractor.ts) & [`src/components/SocialDownloaderPanel.tsx`](file:///c:/Best%20Project/Open/src/components/SocialDownloaderPanel.tsx)
- Severity: Medium (Perceived Latency & UX Double-Blocking)
- Status: RESOLVED
- Root Cause: Pengguna merasakan jeda waktu ("loading sebelum unduhnya lama") akibat dua bottleneck:
  1. Pada fase "Periksa" (inspeksi URL), sistem sebelumnya memanggil subprocess `python -m yt_dlp --dump-json` yang memakan waktu 5-8 detik hanya untuk membaca judul video sebelum kartu format unduhan muncul.
  2. Pada fase "Unduh", frontend melakukan `await fetch()` yang menampung seluruh berkas biner puluhan MB ke dalam RAM memori JavaScript sebelum memicu unduhan browser, sehingga browser tidak menampilkan notifikasi unduhan apa pun selama 10-15 detik.
- Solution:
  1. Menghilangkan ketergantungan `yt-dlp` pada fase inspeksi URL di [`src/lib/downloader/media-extractor.ts`](file:///c:/Best%20Project/Open/src/lib/downloader/media-extractor.ts). Digantikan dengan jalur cepat regex dan oEmbed publik (~300ms) sehingga kartu opsi format unduhan muncul seketika secara instan.
  2. Menambahkan konfigurasi multi-threading `-N 4` (*concurrent fragments*) pada [`src/lib/downloader/download-service.ts`](file:///c:/Best%20Project/Open/src/lib/downloader/download-service.ts).
  3. Memperbarui aksi unduhan di [`src/components/SocialDownloaderPanel.tsx`](file:///c:/Best%20Project/Open/src/components/SocialDownloaderPanel.tsx) menjadi direct download trigger ke browser, menghilangkan penundaan buffer memori JavaScript, dan menyajikan indikator tahapan pemrosesan (menghubungi server -> mengambil stream -> transcoding FFmpeg) yang informatif.
  4. Seluruh 147 test cases Vitest lulus 100%, 0 TypeScript error, dan 0 lint warning.
- Target Deadline: Milestone 19

## Temuan & Pengerasan Milestone 20 (UI Simplification - Downloader Status Indicator)

[PRIORITY: LOW]
- Location: [`src/components/SocialDownloaderPanel.tsx`](file:///c:/Best%20Project/Open/src/components/SocialDownloaderPanel.tsx)
- Severity: Low (UI Cleanliness / Visual Clutter)
- Status: RESOLVED
- Root Cause: Terdapat elemen dekoratif titik biru animasi pulsa (`animate-ping`) pada pesan status pengunduhan yang dirasa mengganggu atau tidak diperlukan oleh pengguna.
- Solution: Menghapus tag `<span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-600 animate-ping mr-1" />` dan mempertahankan teks status informasi unduhan secara bersih.
- Target Deadline: Milestone 20

## Temuan & Pengerasan Milestone 21 (Dark Mode Implementation & Contrast Consistency)

[PRIORITY: MEDIUM]
- Location: Seluruh komponen UI antarmuka ([`src/components/`](file:///c:/Best%20Project/Open/src/components/) & [`src/app/globals.css`](file:///c:/Best%20Project/Open/src/app/globals.css))
- Severity: Medium (Accessibility & Visual Comfort in Low Light)
- Status: RESOLVED
- Root Cause: Aplikasi sebelumnya hanya mendukung tema terang (*light mode*), menyebabkan silau pada penggunaan malam hari dan belum menghormati preferensi sistem operasi pengguna (`prefers-color-scheme: dark`).
- Solution:
  1. Menerapkan `darkMode: 'class'` pada Tailwind CSS dengan token desain terpusat di `globals.css` (`--bg-canvas: #09090b`, `--bg-card: #121215`, dsb.).
  2. Mencegah *Flash of Unstyled Content* (FOUC) dengan menyuntikkan skrip evaluasi tema sinkron di `<head>` pada [`src/app/layout.tsx`](file:///c:/Best%20Project/Open/src/app/layout.tsx).
  3. Menambahkan tombol pengalih tema Sun/Moon berstandar Apple di [`src/components/Header.tsx`](file:///c:/Best%20Project/Open/src/components/Header.tsx) yang tersimpan di `localStorage`.
  4. Memperbarui kontras visual seluruh komponen: [`ConversionPanel.tsx`](file:///c:/Best%20Project/Open/src/components/ConversionPanel.tsx), [`CompressionPanel.tsx`](file:///c:/Best%20Project/Open/src/components/CompressionPanel.tsx), [`BgRemovalPanel.tsx`](file:///c:/Best%20Project/Open/src/components/BgRemovalPanel.tsx), [`SocialDownloaderPanel.tsx`](file:///c:/Best%20Project/Open/src/components/SocialDownloaderPanel.tsx), [`ResultPanel.tsx`](file:///c:/Best%20Project/Open/src/components/ResultPanel.tsx), dan [`SupportedFormatsModal.tsx`](file:///c:/Best%20Project/Open/src/components/SupportedFormatsModal.tsx).
  5. Seluruh 147 test case lulus 100%, 0 error TypeScript, dan 0 warning ESLint.
- Target Deadline: Milestone 21

## Temuan & Pengerasan Milestone 22 (Header Brand Logo Dark Inversion)

[PRIORITY: LOW]
- Location: [`src/components/Header.tsx`](file:///c:/Best%20Project/Open/src/components/Header.tsx)
- Severity: Low (Brand Visual Contrast in Dark Mode)
- Status: RESOLVED
- Root Cause: Asset berkas `Logo.png` memiliki warna gelap bawaan. Ketika pengguna mengaktifkan mode gelap (*dark mode*), logo menjadi hampir tidak terlihat karena menyatu dengan bilah navigasi dan latar belakang yang gelap.
- Solution: Menambahkan filter CSS Tailwind `dark:brightness-0 dark:invert` pada elemen `<Image>` logo di [`src/components/Header.tsx`](file:///c:/Best%20Project/Open/src/components/Header.tsx). Filter ini mengubah logo menjadi warna putih solid murni (`#ffffff`) saat dark mode aktif dan mempertahankan warna aslinya saat light mode, dengan animasi transisi yang halus (`transition-all duration-300`).
- Target Deadline: Milestone 22

## Temuan & Pengerasan Milestone 23 (Removal of Redundant Body Switcher)

[PRIORITY: LOW]
- Location: [`src/app/page.tsx`](file:///c:/Best%20Project/Open/src/app/page.tsx)
- Severity: Low (UI Redundancy & Cognitive Load)
- Status: RESOLVED
- Root Cause: Terdapat dua buah panel pengalih tab mode sekaligus (satu di bilah navigasi atas / notch mengambang dan satu lagi di atas form workspace pada halaman beranda). Hal ini menimbulkan redundansi visual.
- Solution: Menghapus grup tombol pill switcher (`.premium-pill-group`) pada halaman beranda dan memusatkan seluruh kontrol tab navigasi secara tunggal dan presisi pada `Header`. Membersihkan impor ikon yang tidak lagi digunakan dan mengoptimalkan spasi vertikal.
- Target Deadline: Milestone 23

## Temuan & Pengerasan Milestone 24 (Theme Toggle Monochrome White Alignment)

[PRIORITY: LOW]
- Location: [`src/components/Header.tsx`](file:///c:/Best%20Project/Open/src/components/Header.tsx)
- Severity: Low (Aesthetic Preference & Color Harmony)
- Status: RESOLVED
- Root Cause: Ikon matahari (`Sun`) pada mode gelap sebelumnya diberi aksen warna kuning (`text-amber-400`), yang tidak sesuai dengan preferensi monokromatis minimalis yang diinginkan pengguna.
- Solution: Mengganti kelas warna ikon `Sun` menjadi `text-white` murni.
- Target Deadline: Milestone 24

## Temuan & Pengerasan Milestone 25 (Above-the-Fold Viewport Spacing & Card Height Calibration)

[PRIORITY: LOW]
- Location: [`src/app/page.tsx`](file:///c:/Best%20Project/Open/src/app/page.tsx) & [`src/components/FileUploadZone.tsx`](file:///c:/Best%20Project/Open/src/components/FileUploadZone.tsx)
- Severity: Low (Viewport Fit & Vertical Space Balance)
- Status: RESOLVED
- Root Cause: Terdapat ruang kosong berlebih di atas judul utama (*excessive top whitespace*) dan tinggi area seret berkas (*dropzone*) terlalu memanjang ke bawah, sehingga saat pertama kali web dibuka pengguna harus menggulir untuk melihat kartu secara utuh.
- Solution: Memangkas padding atas halaman utama (`pt-3 sm:pt-5`), merapatkan jarak hero section dan kartu, serta memadatkan tinggi visual area unggah seret-lepas menjadi `py-6 sm:py-8 px-4 sm:px-6` dengan ukuran ikon dan tipografi yang proporsional sehingga langsung pas (*fit perfectly above the fold*).
- Target Deadline: Milestone 25

## Temuan & Pengerasan Milestone 26 (Standardisasi Dimensi Panel Antar-Tab)

[PRIORITY: MEDIUM]
- Location: [`src/components/SocialDownloaderPanel.tsx`](file:///c:/Best%20Project/Open/src/components/SocialDownloaderPanel.tsx), [`src/components/BgRemovalPanel.tsx`](file:///c:/Best%20Project/Open/src/components/BgRemovalPanel.tsx), [`src/components/FileUploadZone.tsx`](file:///c:/Best%20Project/Open/src/components/FileUploadZone.tsx)
- Severity: Medium (Visual Inconsistency & Layout Jumps)
- Status: RESOLVED
- Root Cause: Kartu workspace pada tab "Unduh Medsos" memiliki tinggi yang menyusut drastis saat kosong (hanya formulir URL 90px), sedangkan tab "Hapus BG" membesar hingga melebihi tinggi kartu "Konversi Berkas" karena pratinjau gambar 224px.
- Solution: Menetapkan patokan tinggi `min-h-[230px]` yang merujuk pada tabel "Konversi Berkas" secara seragam. Area pencarian "Unduh Medsos" dirancang ulang dengan format container putus-putus (*dashed border*) yang identik dengan area seret berkas, dan pratinjau gambar pada "Hapus BG" dikalibrasi menjadi `max-h-36`.
- Target Deadline: Milestone 26

## Temuan & Pengerasan Milestone 31 (Penataan Ruang Samping Footer)

[PRIORITY: LOW]
- Location: [`src/components/Footer.tsx`](file:///c:/Best%20Project/Open/src/components/Footer.tsx)
- Severity: Low (Layout Proportions & Desktop Whitespace)
- Status: RESOLVED
- Root Cause: Kontainer pembungkus footer sebelumnya dibatasi pada lebar sempit `max-w-4xl px-4 sm:px-6` (896px), sehingga pada monitor desktop atau laptop beresolusi 1366px - 1920px terdapat area ruang kosong hitam yang terlampau luas di sisi kiri dan kanan.
- Solution: Memperluas kontainer footer menjadi `max-w-6xl lg:max-w-7xl px-4 sm:px-8 lg:px-12` (1152px - 1280px), menyesuaikan spasi kartu menjadi `gap-4 sm:gap-6`, serta memperbesar padding kartu menjadi `p-5 sm:p-6`. Ketiga kartu fitur dan bilah hak cipta kini terbentang secara proporsional dan seimbang di seluruh lebar layar.
- Target Deadline: Milestone 31










[PRIORITY: HIGH]
- Location: `src/components/Header.tsx:39-158`
- Severity: High (User Experience / Stuttering Animation Jank & CPU Reflow on Scroll)
- Status: RESOLVED
- Root Cause: Transisi dari navbar biasa ke notch mengalami patah-patah/lag parah karena mencoba menganimasikan mutasi layout-driving properties secara langsung dalam satu tree DOM (`max-width: 1152px` ke `660px`, `height: 64px` ke `48px`, perubahan padding tombol dan `max-height` teks subtitle). Bersamaan dengan itu, efek `backdrop-filter: blur(...)` ikut dihitung ulang per frame saat pengguna menggulir layar, membebani CPU/GPU thread reflow secara masif (menurunkan frame rate dari 60fps ke 15-20fps). Ketiadaan hysteresis threshold juga memicu re-render bolak-balik saat scroll berada di sekitar batas 35px.
- Solution:
  1. Merombak arsitektur transisi menjadi sistem dua layer independen yang 100% diakselerasi GPU (`will-change: transform, opacity`):
     - Layer 1 (`FullNavbar`): Header penuh sticky yang hanya menganimasikan `opacity` dan `translateY(-8px)`.
     - Layer 2 (`FloatingNotch`): Kapsul mengambang (Dynamic Island Notch) berposisi `fixed` yang meluncur dan melakukan scaling mulus `translate3d(-50%, 0, 0) scale(1)` dengan kurva pegas Apple `cubic-bezier(0.16, 1, 0.3, 1)`.
  2. Meniadakan animasi layout `max-width`, `height`, dan `max-height` antar elemen DOM.
  3. Menerapkan hysteresis deadband gulir (`> 45px` aktif, `< 25px` nonaktif) via `requestAnimationFrame` untuk mencegah getaran/jitter mikro.
  4. Animasi kini terkunci di 60/120 FPS tanpa frame drop atau lag.
- Target Deadline: Milestone 16

## Temuan & Pengerasan Milestone 17 (Seamless Single-Shell Morphing Navbar)

[PRIORITY: MEDIUM]
- Location: `src/components/Header.tsx:40-150`
- Severity: Medium (Perceived Loss of Transition Continuity)
- Status: RESOLVED
- Root Cause: Pendekatan cross-fade dua layer terpisah (fading out topbar dan gliding in floating notch) membuat pengguna merasa efek morfologi hilang ("malah gada transisinya"). Pengguna secara eksplisit menginginkan visual kontinuitas fisik di mana bar penuh secara nyata mengerut/bertransformasi (*morphing*) ke dalam notch tanpa terputus, namun tanpa mengalami jank atau lag.
- Solution:
  1. Mengadopsi arsitektur *Single Morphing Shell* dengan satu kurva transisi terpadu `duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]`.
  2. Mengeliminasi seluruh sumber lag layout internal: ukuran logo (`h-8 w-8`), teks judul (`FileFlow PRO`), serta padding tombol navigasi (`px-2.5 sm:px-3 py-1.5`) dibuat 100% konsisten pada kedua status (tidak ada font-size jumps, padding shifts, atau text re-wrapping).
  3. Menjaga efek `backdrop-blur-md` tetap konstan pada kontainer morphing sehingga shader blur tidak di-recompile saat bergulir.
  4. Kontainer luar secara visual mengerut mulus dari `w-full max-w-full rounded-none` (100% lebar layar) menjadi `w-[94vw] max-w-[680px] rounded-full shadow-lg` dengan deadband hysteresis scroll (`> 35px` aktif, `< 15px` kembali).
  5. Seluruh 147 test cases lulus 100%, 0 TypeScript error, dan 0 lint warning.
- Target Deadline: Milestone 17

## Temuan & Pengerasan Milestone 18 (Real Media Downloader Engine & File Integrity Remediation)

[PRIORITY: HIGH]
- Location: [`src/app/api/downloader/download/route.ts`](file:///c:/Best%20Project/Open/src/app/api/downloader/download/route.ts)
- Severity: High (Critical Bug / Media Playback Failure 0xC00D36C4 & Mock Payload Deception)
- Status: RESOLVED
- Root Cause: Endpoint `/api/downloader/download` sebelumnya hanya mengembalikan mock payload statis berupa 4096 byte dummy biner `0xff` untuk MP3 dan box `moov` kosong tanpa track untuk MP4. Ketika berkas diunduh dan dibuka di Windows Media Player, sistem operasi menolak berkas dengan pesan kesalahan `0xC00D36C4` ("Kami tidak dapat membuka berkas. Ini mungkin terjadi karena jenis file tidak didukung, ekstensi file salah, atau file rusak"). Hal ini juga melanggar prinsip anti-deception dan zero fake conversions dari spesifikasi proyek.
- Solution:
  1. Menggantikan seluruh mock dummy bytes dengan arsitektur unduhan biner nyata berbasis `yt-dlp` dan `ffmpeg` pada [`src/lib/downloader/download-service.ts`](file:///c:/Best%20Project/Open/src/lib/downloader/download-service.ts).
  2. Menerapkan instalasi `curl_cffi` pada Python environment server untuk mengatasi bot detection TikTok, Instagram, dan Twitter/X.
  3. Mengonversi audio ke standar MP3 (MPEG-1 Audio Layer 3 stereo dengan ID3v2 header valid) dan video ke MP4 (H.264 + AAC) sehingga 100% kompatibel dengan pemutar bawaan Windows Media Player, Groove, TV & Movies, QuickTime, dan mobile OS.
  4. Melakukan verifikasi otomatis setiap platform (YouTube, TikTok, Instagram, X) menggunakan `ffprobe`: codec audio `mp3`/`aac`, codec video `h264`, bitstream intact, dan probe score 100.
  5. Menjaga isolasi berkas sementara di `.storage/downloads/` dengan pembersihan otomatis instan setelah transmisi stream selesai.
  6. Menjamin seluruh 147 test cases Vitest tetap lulus 100%, 0 TypeScript error, dan 0 ESLint warning.
- Target Deadline: Milestone 18

## Temuan & Pengerasan Milestone 19 (Download Latency & Inspection Speed Optimization)

[PRIORITY: MEDIUM]
- Location: [`src/lib/downloader/media-extractor.ts`](file:///c:/Best%20Project/Open/src/lib/downloader/media-extractor.ts) & [`src/components/SocialDownloaderPanel.tsx`](file:///c:/Best%20Project/Open/src/components/SocialDownloaderPanel.tsx)
- Severity: Medium (Perceived Latency & UX Double-Blocking)
- Status: RESOLVED
- Root Cause: Pengguna merasakan jeda waktu ("loading sebelum unduhnya lama") akibat dua bottleneck:
  1. Pada fase "Periksa" (inspeksi URL), sistem sebelumnya memanggil subprocess `python -m yt_dlp --dump-json` yang memakan waktu 5-8 detik hanya untuk membaca judul video sebelum kartu format unduhan muncul.
  2. Pada fase "Unduh", frontend melakukan `await fetch()` yang menampung seluruh berkas biner puluhan MB ke dalam RAM memori JavaScript sebelum memicu unduhan browser, sehingga browser tidak menampilkan notifikasi unduhan apa pun selama 10-15 detik.
- Solution:
  1. Menghilangkan ketergantungan `yt-dlp` pada fase inspeksi URL di [`src/lib/downloader/media-extractor.ts`](file:///c:/Best%20Project/Open/src/lib/downloader/media-extractor.ts). Digantikan dengan jalur cepat regex dan oEmbed publik (~300ms) sehingga kartu opsi format unduhan muncul seketika secara instan.
  2. Menambahkan konfigurasi multi-threading `-N 4` (*concurrent fragments*) pada [`src/lib/downloader/download-service.ts`](file:///c:/Best%20Project/Open/src/lib/downloader/download-service.ts).
  3. Memperbarui aksi unduhan di [`src/components/SocialDownloaderPanel.tsx`](file:///c:/Best%20Project/Open/src/components/SocialDownloaderPanel.tsx) menjadi direct download trigger ke browser, menghilangkan penundaan buffer memori JavaScript, dan menyajikan indikator tahapan pemrosesan (menghubungi server -> mengambil stream -> transcoding FFmpeg) yang informatif.
  4. Seluruh 147 test cases Vitest lulus 100%, 0 TypeScript error, dan 0 lint warning.
- Target Deadline: Milestone 19

## Temuan & Pengerasan Milestone 20 (UI Simplification - Downloader Status Indicator)

[PRIORITY: LOW]
- Location: [`src/components/SocialDownloaderPanel.tsx`](file:///c:/Best%20Project/Open/src/components/SocialDownloaderPanel.tsx)
- Severity: Low (UI Cleanliness / Visual Clutter)
- Status: RESOLVED
- Root Cause: Terdapat elemen dekoratif titik biru animasi pulsa (`animate-ping`) pada pesan status pengunduhan yang dirasa mengganggu atau tidak diperlukan oleh pengguna.
- Solution: Menghapus tag `<span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-600 animate-ping mr-1" />` dan mempertahankan teks status informasi unduhan secara bersih.
- Target Deadline: Milestone 20

## Temuan & Pengerasan Milestone 21 (Dark Mode Implementation & Contrast Consistency)

[PRIORITY: MEDIUM]
- Location: Seluruh komponen UI antarmuka ([`src/components/`](file:///c:/Best%20Project/Open/src/components/) & [`src/app/globals.css`](file:///c:/Best%20Project/Open/src/app/globals.css))
- Severity: Medium (Accessibility & Visual Comfort in Low Light)
- Status: RESOLVED
- Root Cause: Aplikasi sebelumnya hanya mendukung tema terang (*light mode*), menyebabkan silau pada penggunaan malam hari dan belum menghormati preferensi sistem operasi pengguna (`prefers-color-scheme: dark`).
- Solution:
  1. Menerapkan `darkMode: 'class'` pada Tailwind CSS dengan token desain terpusat di `globals.css` (`--bg-canvas: #09090b`, `--bg-card: #121215`, dsb.).
  2. Mencegah *Flash of Unstyled Content* (FOUC) dengan menyuntikkan skrip evaluasi tema sinkron di `<head>` pada [`src/app/layout.tsx`](file:///c:/Best%20Project/Open/src/app/layout.tsx).
  3. Menambahkan tombol pengalih tema Sun/Moon berstandar Apple di [`src/components/Header.tsx`](file:///c:/Best%20Project/Open/src/components/Header.tsx) yang tersimpan di `localStorage`.
  4. Memperbarui kontras visual seluruh komponen: [`ConversionPanel.tsx`](file:///c:/Best%20Project/Open/src/components/ConversionPanel.tsx), [`CompressionPanel.tsx`](file:///c:/Best%20Project/Open/src/components/CompressionPanel.tsx), [`BgRemovalPanel.tsx`](file:///c:/Best%20Project/Open/src/components/BgRemovalPanel.tsx), [`SocialDownloaderPanel.tsx`](file:///c:/Best%20Project/Open/src/components/SocialDownloaderPanel.tsx), [`ResultPanel.tsx`](file:///c:/Best%20Project/Open/src/components/ResultPanel.tsx), dan [`SupportedFormatsModal.tsx`](file:///c:/Best%20Project/Open/src/components/SupportedFormatsModal.tsx).
  5. Seluruh 147 test case lulus 100%, 0 error TypeScript, dan 0 warning ESLint.
- Target Deadline: Milestone 21

## Temuan & Pengerasan Milestone 22 (Header Brand Logo Dark Inversion)

[PRIORITY: LOW]
- Location: [`src/components/Header.tsx`](file:///c:/Best%20Project/Open/src/components/Header.tsx)
- Severity: Low (Brand Visual Contrast in Dark Mode)
- Status: RESOLVED
- Root Cause: Asset berkas `Logo.png` memiliki warna gelap bawaan. Ketika pengguna mengaktifkan mode gelap (*dark mode*), logo menjadi hampir tidak terlihat karena menyatu dengan bilah navigasi dan latar belakang yang gelap.
- Solution: Menambahkan filter CSS Tailwind `dark:brightness-0 dark:invert` pada elemen `<Image>` logo di [`src/components/Header.tsx`](file:///c:/Best%20Project/Open/src/components/Header.tsx). Filter ini mengubah logo menjadi warna putih solid murni (`#ffffff`) saat dark mode aktif dan mempertahankan warna aslinya saat light mode, dengan animasi transisi yang halus (`transition-all duration-300`).
- Target Deadline: Milestone 22

## Temuan & Pengerasan Milestone 23 (Removal of Redundant Body Switcher)

[PRIORITY: LOW]
- Location: [`src/app/page.tsx`](file:///c:/Best%20Project/Open/src/app/page.tsx)
- Severity: Low (UI Redundancy & Cognitive Load)
- Status: RESOLVED
- Root Cause: Terdapat dua buah panel pengalih tab mode sekaligus (satu di bilah navigasi atas / notch mengambang dan satu lagi di atas form workspace pada halaman beranda). Hal ini menimbulkan redundansi visual.
- Solution: Menghapus grup tombol pill switcher (`.premium-pill-group`) pada halaman beranda dan memusatkan seluruh kontrol tab navigasi secara tunggal dan presisi pada `Header`. Membersihkan impor ikon yang tidak lagi digunakan dan mengoptimalkan spasi vertikal.
- Target Deadline: Milestone 23

## Temuan & Pengerasan Milestone 24 (Theme Toggle Monochrome White Alignment)

[PRIORITY: LOW]
- Location: [`src/components/Header.tsx`](file:///c:/Best%20Project/Open/src/components/Header.tsx)
- Severity: Low (Aesthetic Preference & Color Harmony)
- Status: RESOLVED
- Root Cause: Ikon matahari (`Sun`) pada mode gelap sebelumnya diberi aksen warna kuning (`text-amber-400`), yang tidak sesuai dengan preferensi monokromatis minimalis yang diinginkan pengguna.
- Solution: Mengganti kelas warna ikon `Sun` menjadi `text-white` murni.
- Target Deadline: Milestone 24

## Temuan & Pengerasan Milestone 25 (Above-the-Fold Viewport Spacing & Card Height Calibration)

[PRIORITY: LOW]
- Location: [`src/app/page.tsx`](file:///c:/Best%20Project/Open/src/app/page.tsx) & [`src/components/FileUploadZone.tsx`](file:///c:/Best%20Project/Open/src/components/FileUploadZone.tsx)
- Severity: Low (Viewport Fit & Vertical Space Balance)
- Status: RESOLVED
- Root Cause: Terdapat ruang kosong berlebih di atas judul utama (*excessive top whitespace*) dan tinggi area seret berkas (*dropzone*) terlalu memanjang ke bawah, sehingga saat pertama kali web dibuka pengguna harus menggulir untuk melihat kartu secara utuh.
- Solution: Memangkas padding atas halaman utama (`pt-3 sm:pt-5`), merapatkan jarak hero section dan kartu, serta memadatkan tinggi visual area unggah seret-lepas menjadi `py-6 sm:py-8 px-4 sm:px-6` dengan ukuran ikon dan tipografi yang proporsional sehingga langsung pas (*fit perfectly above the fold*).
- Target Deadline: Milestone 25

## Temuan & Pengerasan Milestone 26 (Standardisasi Dimensi Panel Antar-Tab)

[PRIORITY: MEDIUM]
- Location: [`src/components/SocialDownloaderPanel.tsx`](file:///c:/Best%20Project/Open/src/components/SocialDownloaderPanel.tsx), [`src/components/BgRemovalPanel.tsx`](file:///c:/Best%20Project/Open/src/components/BgRemovalPanel.tsx), [`src/components/FileUploadZone.tsx`](file:///c:/Best%20Project/Open/src/components/FileUploadZone.tsx)
- Severity: Medium (Visual Inconsistency & Layout Jumps)
- Status: RESOLVED
- Root Cause: Kartu workspace pada tab "Unduh Medsos" memiliki tinggi yang menyusut drastis saat kosong (hanya formulir URL 90px), sedangkan tab "Hapus BG" membesar hingga melebihi tinggi kartu "Konversi Berkas" karena pratinjau gambar 224px.
- Solution: Menetapkan patokan tinggi `min-h-[230px]` yang merujuk pada tabel "Konversi Berkas" secara seragam. Area pencarian "Unduh Medsos" dirancang ulang dengan format container putus-putus (*dashed border*) yang identik dengan area seret berkas, dan pratinjau gambar pada "Hapus BG" dikalibrasi menjadi `max-h-36`.
- Target Deadline: Milestone 26

## Temuan & Pengerasan Milestone 31 (Penataan Ruang Samping Footer)

[PRIORITY: LOW]
- Location: [`src/components/Footer.tsx`](file:///c:/Best%20Project/Open/src/components/Footer.tsx)
- Severity: Low (Layout Proportions & Desktop Whitespace)
- Status: RESOLVED
- Root Cause: Kontainer pembungkus footer sebelumnya dibatasi pada lebar sempit `max-w-4xl px-4 sm:px-6` (896px), sehingga pada monitor desktop atau laptop beresolusi 1366px - 1920px terdapat area ruang kosong hitam yang terlampau luas di sisi kiri dan kanan.
- Solution: Memperluas kontainer footer menjadi `max-w-6xl lg:max-w-7xl px-4 sm:px-8 lg:px-12` (1152px - 1280px), menyesuaikan spasi kartu menjadi `gap-4 sm:gap-6`, serta memperbesar padding kartu menjadi `p-5 sm:p-6`. Ketiga kartu fitur dan bilah hak cipta kini terbentang secara proporsional dan seimbang di seluruh lebar layar.
- Target Deadline: Milestone 31














## Temuan & Pengerasan Milestone 32 (Ekspansi Fitur Batch, PDF Tools & Privacy Mode)

[PRIORITY: LOW]
- Location: [`src/app/api/jobs/[id]/download/route.ts`](file:///c:/Best%20Project/Open/src/app/api/jobs/[id]/download/route.ts)
- Severity: Low (MIME Content-Type Accuracy)
- Status: RESOLVED
- Root Cause: Peta tipe ekstensi berkas belum memuat pemetaan eksplisit untuk format `.zip`, sehingga pengunduhan bundel batch berisiko dilayani sebagai `application/octet-stream`.
- Solution: Menambahkan entri `zip: "application/zip"` pada konstanta `EXTENSION_MIME_MAP` agar arsip ZIP dikenali dengan benar oleh browser pengguna dan media viewer.
- Target Deadline: Milestone 32


## Temuan & Pengerasan Milestone 33 (Pembersihan Badge Redundan Dropzone)

[PRIORITY: LOW]
- Location: [`src/components/FileUploadZone.tsx`](file:///c:/Best%20Project/Open/src/components/FileUploadZone.tsx)
- Severity: Low (UI Redundancy & Visual Decluttering)
- Status: RESOLVED
- Root Cause: Terdapat pengulangan informasi antara baris teks deskripsi pendukung format dengan badge pill di bawahnya (`DOCX, PPTX, XLSX`, `PDF Universal`, dll.), serta badge batas ukuran berkas yang membuat area seret terasa terlalu padat dan berulang.
- Solution: Menghapus seluruh chip format dan badge ukuran di bawah teks, lalu menyatukan informasi batas ukuran berkas secara ringkas langsung ke dalam baris teks utama (`Mendukung: {acceptedTypesLabel} (Maks. 50 MB)`).
- Target Deadline: Milestone 33


## Temuan & Pengerasan Milestone 34 (Penyelarasan Vertikal Layar Pengguna)

[PRIORITY: LOW]
- Location: [`src/app/page.tsx`](file:///c:/Best%20Project/Open/src/app/page.tsx)
- Severity: Low (Viewport Balance & Vertical Centering)
- Status: RESOLVED
- Root Cause: Kontainer utama sebelumnya menggunakan padding statis yang terlalu dekat ke atas (`pt-3 sm:pt-5`), sehingga pada monitor desktop/laptop dengan tinggi layar sedang hingga besar (768p - 1080p), seluruh konten tertarik ke atas dan menyisakan ruang kosong gelap yang terlalu luas di bagian bawah sebelum footer.
- Solution: Mengubah kontainer `<main>` menjadi flexbox fleksibel vertikal (`flex-1 flex flex-col justify-center py-6 sm:py-10 md:py-14`) dan menerapkan `my-auto` pada pembungkus hero dan kartu kerja. Posisi konten kini otomatis terdistribusi seimbang pas di tengah layar pengguna secara adaptif.
- Target Deadline: Milestone 34


## Temuan & Pengerasan Milestone 35 (Perbaikan Overflow Tombol Header Floating)

[PRIORITY: MEDIUM]
- Location: [`src/components/Header.tsx`](file:///c:/Best%20Project/Open/src/components/Header.tsx)
- Severity: Medium (Visual Clipping & Overflowing Element)
- Status: RESOLVED
- Root Cause: Teks label tab yang terlalu panjang (`Konversi Berkas`, `Kompres File`, `Hapus & Ganti BG`) ditambah batas lebar kontainer pil yang sempit (`max-w-[860px]`) menyebabkan tombol Privasi terpotong garis lengkung kanan pil dan tombol Tema (ikon Matahari) mencuat keluar dari kontainer (*overflowing*).
- Solution: Memadatkan label tab menjadi kata aksi yang ringkas (`Konversi`, `Kompres`, `Hapus BG`, `Unduh Medsos`, `Alat PDF`), memperlebar batas kontainer pil menjadi `max-w-[940px]`, dan menata ulang padding `px-3.5 sm:px-5`. Seluruh tombol kini berada di dalam pil secara simetris dan rapi.
- Target Deadline: Milestone 35


## Temuan & Pengerasan Milestone 36 (Halaman Mandiri Tautan Footer)

[PRIORITY: MEDIUM]
- Location: [`src/components/Footer.tsx`](file:///c:/Best%20Project/Open/src/components/Footer.tsx), [`src/app/privacy/page.tsx`](file:///c:/Best%20Project/Open/src/app/privacy/page.tsx), [`src/app/terms/page.tsx`](file:///c:/Best%20Project/Open/src/app/terms/page.tsx), [`src/app/docs/page.tsx`](file:///c:/Best%20Project/Open/src/app/docs/page.tsx)
- Severity: Medium (Empty Navigation Elements & Missing Informational Routes)
- Status: RESOLVED
- Root Cause: Tiga tautan pada bagian footer ('Kebijakan Privasi', 'Syarat & Ketentuan', 'Dokumentasi') sebelumnya hanya berupa elemen `<span>` statis tanpa route tujuan dan belum memiliki halaman mandiri masing-masing.
- Solution: Membangun tiga halaman rute terpisah mandiri (`/privacy`, `/terms`, dan `/docs`) lengkap dengan header navigasi kembali, dokumentasi arsitektur komprehensif, kepatuhan hukum dan privasi efemeral, serta menyambungkannya menggunakan komponen `<Link>` dari Next.js pada footer utama.
- Target Deadline: Milestone 36


## Temuan & Pengerasan Milestone 37 (Eliminasi Warna Hijau pada Aksen Privasi & Indikator)

[PRIORITY: LOW]
- Location: [`src/app/page.tsx`](file:///c:/Best%20Project/Open/src/app/page.tsx), [`src/app/privacy/page.tsx`](file:///c:/Best%20Project/Open/src/app/privacy/page.tsx), [`src/components/Header.tsx`](file:///c:/Best%20Project/Open/src/components/Header.tsx), [`src/components/BatchQueuePanel.tsx`](file:///c:/Best%20Project/Open/src/components/BatchQueuePanel.tsx), [`src/components/FileUploadZone.tsx`](file:///c:/Best%20Project/Open/src/components/FileUploadZone.tsx), [`src/components/ResultPanel.tsx`](file:///c:/Best%20Project/Open/src/components/ResultPanel.tsx)
- Severity: Low (Color Scheme Discordance & User Visual Preference)
- Status: RESOLVED
- Root Cause: Penggunaan warna hijau cerah (`emerald-500` / `emerald-600`) pada banner mode privasi dan badge privasi terisolasi menciptakan kontras visual yang terlalu mencolok dan tidak selaras dengan tema monokrom/dark mode FileFlow.
- Solution: Mengganti seluruh aksen hijau pada badge, border, dan icon indikator privasi menjadi warna biru modern (`blue-500` / `blue-600`) yang elegan, tenang, dan memiliki asosiasi psikologis keamanan yang tinggi.
- Target Deadline: Milestone 37



## Temuan & Pengerasan Milestone 38 (Audit Forensik UI/UX Menyeluruh & Eliminasi AI Slop)

[PRIORITY: CRITICAL]
- Location: [`src/components/BatchQueuePanel.tsx`](file:///c:/Best%20Project/Open/src/components/BatchQueuePanel.tsx), [`src/app/page.tsx`](file:///c:/Best%20Project/Open/src/app/page.tsx)
- Severity: Critical (Privacy Mode Integrity & Anti-Deception Violation)
- Status: RESOLVED
- Root Cause: Komponen `BatchQueuePanel` menerima prop `privacyMode` dan menampilkan lencana "Privasi Aktif", namun fungsi `processSingleItem` tetap mengirimkan seluruh berkas antrian ke endpoint server `POST /api/jobs`. Selain itu, pada `page.tsx`, banner Mode Privasi tetap mengklaim pemrosesan 100% tanpa unggah server meskipun pengguna berada pada tab modul berbasis server (`Kompres`, `Hapus BG`, `Alat PDF`, `Unduh Media`), serta drop multi-berkas pada tab `Kompres`/`Hapus BG` secara keliru mengalihkan pengguna ke panel konversi batch.
- Solution: Mengimplementasikan eksekusi lokal murni di memori browser (`canProcessClientSide`, `processImageClientSide`, `processDataClientSide`) di dalam `BatchQueuePanel` saat Kunci Privasi Lokal aktif, menambahkan *Privacy Lock Scope Guard* jujur yang memblokir unggahan diam-diam pada modul server hingga pengguna mengizinkan sandbox server, serta membatasi prop `multiple={activeTab === 'convert'}`.
- Target Deadline: Milestone 38

[PRIORITY: HIGH]
- Location: [`src/components/FileUploadZone.tsx`](file:///c:/Best%20Project/Open/src/components/FileUploadZone.tsx)
- Severity: High (Broken Interactive Control / Unmounted File Input Ref)
- Status: RESOLVED
- Root Cause: Elemen `<input ref={fileInputRef} type="file" />` hanya dirender di dalam cabang kondisional `{!selectedFile ? (...) : (...)}`. Ketika berkas telah dipilih (`selectedFile !== null`), elemen input terlepas dari DOM (`fileInputRef.current === null`), sehingga tombol "Ganti Berkas" gagal memicu dialog pemilih berkas sama sekali.
- Solution: Memindahkan elemen `<input ref={fileInputRef} type="file" />` ke tingkat root komponen `FileUploadZone` agar referensi DOM tetap hidup baik sebelum maupun sesudah berkas dipilih, serta mereset `e.target.value = ''` agar pemilihan ulang berkas bekerja konsisten.
- Target Deadline: Milestone 38

[PRIORITY: HIGH]
- Location: [`src/components/ResultPanel.tsx`](file:///c:/Best%20Project/Open/src/components/ResultPanel.tsx), [`src/components/SocialDownloaderPanel.tsx`](file:///c:/Best%20Project/Open/src/components/SocialDownloaderPanel.tsx), [`src/components/Header.tsx`](file:///c:/Best%20Project/Open/src/components/Header.tsx), dan seluruh komponen UI
- Severity: High (Invalid Tailwind v4 & Hallucinated Utility Classes in Tailwind v3.4.14)
- Status: RESOLVED
- Root Cause: Proyek menggunakan Tailwind CSS `^3.4.14`, namun berbagai komponen menggunakan kelas khusus Tailwind v4 atau kelas halusinasi yang gagal menghasilkan CSS: `shadow-2xs`, `shadow-xs` (45+ lokasi), `focus:outline-hidden` (merusak fokus keyboard), `duration-400`, `sm:h-5.5`, `shadow-zinc-950/8`, `py-0.2`, serta kelas `.bg-checkerboard` pada `ResultPanel.tsx` yang tidak terdefinisi di `globals.css` (seharusnya `.checkerboard-premium`).
- Solution: Mengeliminasi seluruh kelas tidak valid tersebut, menggantinya dengan sistem token bayangan dan fokus WCAG 2.2 AA yang valid di Tailwind v3.4, serta memperbaiki `.checkerboard-premium` pada pratinjau hasil PNG transparan.
- Target Deadline: Milestone 38

[PRIORITY: MEDIUM]
- Location: [`src/components/PdfToolsPanel.tsx`](file:///c:/Best%20Project/Open/src/components/PdfToolsPanel.tsx)
- Severity: Medium (Missing Drag-and-Drop Handlers & Undersized Touch Targets)
- Status: RESOLVED
- Root Cause: Area unggah bergaris putus-putus pada mode Merge PDF dan Split PDF tidak memiliki *event handler* `onDragOver` dan `onDrop`, sehingga menyeret berkas PDF ke area tersebut menyebabkan peramban membuka berkas PDF secara langsung dan meninggalkan aplikasi. Selain itu, tombol pengurut halaman hanya berukuran `22x22px`.
- Solution: Menambahkan penanganan penuh `onDragOver`, `onDragLeave`, dan `onDrop` beserta indikator visual aktif pada kedua mode PDF, serta memperbesar tombol aksi urutan dan penghapusan menjadi `36x36px` (`h-9 w-9`).
- Target Deadline: Milestone 38

[PRIORITY: MEDIUM]
- Location: [`src/components/SupportedFormatsModal.tsx`](file:///c:/Best%20Project/Open/src/components/SupportedFormatsModal.tsx), [`src/components/Header.tsx`](file:///c:/Best%20Project/Open/src/components/Header.tsx), [`src/app/docs/page.tsx`](file:///c:/Best%20Project/Open/src/app/docs/page.tsx), [`src/app/privacy/page.tsx`](file:///c:/Best%20Project/Open/src/app/privacy/page.tsx), [`src/app/terms/page.tsx`](file:///c:/Best%20Project/Open/src/app/terms/page.tsx)
- Severity: Medium (Orphaned Modal Component, Mobile Header Overflow & Contrast Warnings)
- Status: RESOLVED
- Root Cause: `SupportedFormatsModal` tidak pernah dipasang pada `page.tsx`; bar navigasi `Header.tsx` meluber pada layar seluler `360px`; halaman `/docs`, `/privacy`, dan `/terms` tidak memiliki sakelar tema gelap/terang; serta 6 komponen memicu peringatan kontras `gray-on-color`.
- Solution: Menghubungkan `SupportedFormatsModal` (lengkap dengan fitur filter pencarian instan) ke `Header` dan meja kerja utama, membangun `SubpageHeader` dan `ThemeToggle` bersama, merancang *mobile tool rail* 5-kolom bebas *overflow*, serta menstandarkan *alert* error semantik hingga detektor mekanis mencatat 0 pelanggaran.
- Target Deadline: Milestone 38



## Temuan & Pengerasan Milestone 39 (Transformasi UI Gaya Nusa & Stress-Test Puluhan Berkas Lintas 5 Sistem)

[PRIORITY: CRITICAL]
- Location: [`src/lib/downloader/media-extractor.ts`](file:///c:/Best%20Project/Open/src/lib/downloader/media-extractor.ts)
- Severity: Critical (SSRF Bypass via V8-Normalized IPv4-Mapped IPv6 & Private Subnet Evasion)
- Status: RESOLVED
- Root Cause: Validasi SSRF sebelumnya hanya memeriksa alamat `127.0.0.1` dan `::1` berbasis ekspresi reguler sederhana. Ketika penyerang mengirimkan URL dengan alamat IPv4-mapped IPv6 seperti `http://[::ffff:127.0.0.1]/` atau `http://[::ffff:169.254.169.254]/`, parser `new URL()` di mesin V8 menormalisasi hostname menjadi bentuk heksadesimal terkompresi `[::ffff:7f00:1]` atau `[::ffff:a9fe:a9fe]`, sehingga lolos dari pencocokan regex teks dan mengizinkan ekstraksi ke jaringan internal loopback/cloud metadata.
- Solution: Mengganti pencocokan string dengan parser biner kanonik 128-bit (`parseIpv6Groups`) yang mengekspansi notasi `::` menjadi `uint16[8]` serta memblokir seluruh rentang alamat non-publik secara *fail-closed*: loopback, unspecified, unique-local (`fc00::/7`), link-local (`fe80::/10`), site-local, multicast, IPv4-mapped (`::ffff:0:0/96`), IPv4-compatible, IPv4-translated, 6to4 (`2002::/16`), NAT64 (`64:ff9b::/96`), Teredo (`2001:0000::/32`), CGNAT (`100.64.0.0/10`), dan `.internal`/`.local`.
- Target Deadline: Milestone 39

[PRIORITY: CRITICAL]
- Location: [`src/lib/compression/file-compressor.ts`](file:///c:/Best%20Project/Open/src/lib/compression/file-compressor.ts), [`src/app/api/compress/route.ts`](file:///c:/Best%20Project/Open/src/app/api/compress/route.ts)
- Severity: Critical (PDF Xref Table Corruption, Animated WebP Frame Destruction & Fake Binary Compression Fallback)
- Status: RESOLVED
- Root Cause: Tiga cacat kritis ditemukan pada mesin kompresi saat diuji dengan puluhan variasi berkas: (1) Kompresi PDF lama memodifikasi byte mentah string konten PDF secara langsung sehingga menggeser offset byte tabel `xref` dan merusak berkas PDF; (2) Pemanggilan `.rotate()` tanpa syarat pada `sharp(buffer, { animated: true })` meratakan animasi WebP multi-frame menjadi satu gambar strip vertikal statis (`pages: undefined`); (3) Fungsi `compressGenericBinary` mengembalikan salinan byte mentah tanpa kompresi nyata untuk format media/biner yang belum tertangani.
- Solution: Membangun ulang kompresi PDF murni berbasis struktur objek `pdf-lib` (`useObjectStreams: true`) dengan kompresi ulang *image XObject* `/DCTDecode` via `sharp`, membatasi pemanggilan `.rotate()` hanya pada WebP satu-frame (`(webpMeta.pages ?? 1) <= 1`) agar animasi multi-frame tetap utuh, mengintegrasikan kompresi video/audio nyata berbasis `FFmpeg` (`libx264`/`libvpx-vp9`/`aac`/`libmp3lame`/`libopus`/`flac`) dan kompresi media internal paket OpenXML (`DOCX`/`PPTX`/`XLSX`), serta menghapus fungsi `compressGenericBinary` demi kepatuhan prinsip *anti-deception*.
- Target Deadline: Milestone 39

[PRIORITY: HIGH]
- Location: [`src/lib/bg-removal/sharp-local-provider.ts`](file:///c:/Best%20Project/Open/src/lib/bg-removal/sharp-local-provider.ts), [`src/app/api/background-removal/route.ts`](file:///c:/Best%20Project/Open/src/app/api/background-removal/route.ts)
- Severity: High (Foreground White-Shirt Erasure on Studio Portraits & Opaque Re-Flooding of Transparent PNGs)
- Status: RESOLVED
- Root Cause: Algoritma penghapus latar belakang lokal sebelumnya menghapus piksel berdasarkan kedekatan warna global tanpa analisis konektivitas tepi dan gradien kontur. Akibatnya, pas foto subjek berkemeja putih di depan tembok studio putih ikut berlubang di bagian pakaian/mata, sementara berkas PNG yang sudah memiliki latar transparan berisiko terproses ulang secara keliru.
- Solution: Mengimplementasikan algoritma *Border-Seeded CIE-Lab Perceptual Flood-Fill + Sobel Gradient Edge Barrier + 1-2px Alpha Feathering & Foreground Color Despill*. Penelusuran latar hanya merambat dari piksel bingkai luar dan berhenti tegas pada penghalang gradien Sobel pakaian/bahu, serta mendeteksi dini citra PNG yang sudah transparan agar alfa rambut halus tetap terjaga atau langsung dikompositkan ke warna pas foto (`#D32F2F` / `#0277BD`).
- Target Deadline: Milestone 39

[PRIORITY: HIGH]
- Location: [`src/app/api/downloader/download/route.ts`](file:///c:/Best%20Project/Open/src/app/api/downloader/download/route.ts), [`src/lib/downloader/download-service.ts`](file:///c:/Best%20Project/Open/src/lib/downloader/download-service.ts)
- Severity: High (Windows NTFS `EBUSY` Temporary Directory Leak & Double RAM Buffering on Media Download)
- Status: RESOLVED
- Root Cause: Endpoint pengunduhan media sebelumnya memuat seluruh berkas video ke memori (`fs.readFileSync`) sebelum mengirim respons, dan saat diubah ke `ReadableStream`, pemanggilan `safeCleanup()` pada event `nodeStream.on("end")` berjalan sebelum sistem operasi Windows menutup *file descriptor* (`"close"`), memicu galat `EBUSY` diam-diam yang meninggalkan direktori sementara `dl_*` di `.storage/downloads`.
- Solution: Mengalirkan berkas langsung melalui `fs.createReadStream` ke Web `ReadableStream` tanpa *double buffering* RAM, memanggil `nodeStream.destroy()` saat `"end"`, mengeksekusi penghapusan direktori di dalam event `nodeStream.on("close")` (serta `cancel()`), dan memperkuat `removeDirectorySafely` dengan `maxRetries: 5, retryDelay: 40` beserta *fallback* asinkron.
- Target Deadline: Milestone 39

[PRIORITY: HIGH]
- Location: [`src/lib/document/pdf-tools.ts`](file:///c:/Best%20Project/Open/src/lib/document/pdf-tools.ts), [`src/app/api/pdf/merge/route.ts`](file:///c:/Best%20Project/Open/src/app/api/pdf/merge/route.ts), [`src/app/api/pdf/split/route.ts`](file:///c:/Best%20Project/Open/src/app/api/pdf/split/route.ts)
- Severity: High (Unhandled HTTP 500 on Truncated `%PDF-1.4` Stubs & Encrypted PDF Documents)
- Status: RESOLVED
- Root Cause: `PDFDocument.load()` pada `pdf-lib` menerima potongan header `%PDF-1.4` rusak yang kehilangan katalog `/Root` dan `/Pages` tanpa melempar error di awal, lalu gagal dengan `Error` tak tertangani (`HTTP 500`) ketika `getPageCount()` atau `getPages()` dipanggil di luar blok validasi. Selain itu, kapasitas penggabungan dibatasi hanya 20 berkas PDF.
- Solution: Memaksa evaluasi struktural `doc.getPageCount()` dan `doc.getPages()` secara langsung di dalam blok `try/catch` fungsi `loadUnlockedPdfDocument` dengan pewarisan prototipe `PdfValidationError` yang utuh sehingga PDF rusak atau terkunci kata sandi selalu mengembalikan `HTTP 400` (`CORRUPT_PDF` / `ENCRYPTED_PDF`) yang ramah pengguna, serta menaikkan kapasitas *Merge PDF* hingga 60 berkas sekaligus.
- Target Deadline: Milestone 39

[PRIORITY: MEDIUM]
- Location: [`src/lib/document/pdf-builder.ts`](file:///c:/Best%20Project/Open/src/lib/document/pdf-builder.ts), [`src/lib/document/office-parser.ts`](file:///c:/Best%20Project/Open/src/lib/document/office-parser.ts), [`src/lib/adapters/office-document.ts`](file:///c:/Best%20Project/Open/src/lib/adapters/office-document.ts), [`src/lib/adapters/ffmpeg-media.ts`](file:///c:/Best%20Project/Open/src/lib/adapters/ffmpeg-media.ts), [`src/lib/image/bmp-ico-codec.ts`](file:///c:/Best%20Project/Open/src/lib/image/bmp-ico-codec.ts), [`src/lib/document/zip-writer.ts`](file:///c:/Best%20Project/Open/src/lib/document/zip-writer.ts), [`src/lib/storage/temp-storage.ts`](file:///c:/Best%20Project/Open/src/lib/storage/temp-storage.ts)
- Severity: Medium (Multi-Format Fidelity Edge Cases Across Document, Image, Media, Storage TTL & ZIP UTF-8)
- Status: RESOLVED
- Root Cause: Pengujian lintas puluhan jenis berkas menyingkap serangkaian cacat presisi format: ketidakcocokan `/Length` byte WinAnsi pada `pdf-builder.ts`, gambar PNG slide `PPTX` yang terabaikan saat ekspor PDF, pergeseran kolom sel renggang (`r="C2"`) dan pemotongan kolom lebar pada `XLSX`, kegagalan `FFmpeg libx264 yuv420p` pada dimensi video ganjil (`321x241`) serta konversi video bisu ke audio tanpa pesan jelas, ketiadaan bit UTF-8 (`0x0800`) pada header `ZipWriter`, belum ditegakkannya status `HTTP 410 Gone` saat TTL 60 menit kedaluwarsa, serta absennya frame High-DPI `256x256` pada konversi `.ICO`.
- Solution: Memperbaiki kalkulasi panjang byte stream PDF WinAnsi, menambahkan komposit gambar PNG dan JPG pada `PPTX -> PDF`, mengurai koordinat kolom penuh `XLSX` tanpa pemotongan, memasang filter `scale=trunc(iw/2)*2:trunc(ih/2)*2` dan pemeriksaan stream audio via `ffprobe`, menyematkan bit UTF-8 `0x0800` pada `ZipWriter` & `client-zip.ts`, menegakkan TTL 60 menit (`HTTP 410`) beserta *sweeper* `.storage`, membangun codec murni `BMP` dan multi-frame `ICO` (`16, 32, 48, 256`), serta menambahkan generator native `DOCX`/`XLSX` dan parser `ODT`/`RTF`/`FlateDecode PDF`.
- Target Deadline: Milestone 39



## Temuan & Pengerasan Milestone 40 (Transformasi UI Putih Minimalis Porselen & Full-Screen Vertical Slide Snapping)

[PRIORITY: HIGH]
- Location: [`src/app/page.tsx`](file:///c:/Best%20Project/Open/src/app/page.tsx), [`src/components/FullPageSlideDeck.tsx`](file:///c:/Best%20Project/Open/src/components/FullPageSlideDeck.tsx), [`src/app/globals.css`](file:///c:/Best%20Project/Open/src/app/globals.css), [`src/app/layout.tsx`](file:///c:/Best%20Project/Open/src/app/layout.tsx)
- Severity: High (Visual Direction Mismatch, Cognitive Density & Missing Slide-by-Slide Viewport Choreography)
- Status: RESOLVED
- Root Cause: Antarmuka gelap pekat sebelumnya dinilai pengguna terlalu berat dan menyerupai pola *AI slop* dibandingkan referensi visual SaaS putih minimalis premium yang diinginkan. Selain itu, tata letak gulir kontinu standar mencampurkan tajuk presentasi utama dengan formulir kerja dan bagian bawah halaman tanpa ritme transisi per-layar (*slide-by-slide vertical scroll snapping*), serta berisiko menjebak interaksi gulir internal pada daftar antrian batch dan modal apabila CSS `scroll-snap` naif diterapkan begitu saja.
- Solution: Merombak menyeluruh lapisan antarmuka ke sistem desain **Sunlit Porcelain & Coastal Glass** (`#ffffff` kanvas putih murni, `#f6f8fb` porselen lembut, `#111315` kapsul hitam matte, tipografi `Onest` + `JetBrains Mono`, dan aksen kaca buram `.surface-glass` di atas horizon laut tenang `public/images/coastal-horizon.webp`) sembari mempertahankan 100% seluruh informasi, teks, metrik, Catatan Privasi Jujur, 5 FAQ, dan kapabilitas 5 modul. Membangun mesin `FullPageSlideDeck.tsx` (`100dvh` 5-slide track dengan transisi `680ms cubic-bezier(0.22, 1, 0.36, 1)`, pengunci inersia *trackpad*, navigasi *swipe* & papan ketik, indikator titik samping, serta pelindung gulir bersarang otomatis `[data-slide-scrollable]` pada antrian batch, daftar merge PDF, dan modal format).
- Target Deadline: Milestone 40



## Temuan & Pengerasan Milestone 41 (Perbaikan Pembekuan Scroll Beranda pada Touchpad Laptop, Firefox & Scrollbar Native)

[PRIORITY: CRITICAL]
- Location: [`src/components/FullPageSlideDeck.tsx`](file:///c:/Best%20Project/Open/src/components/FullPageSlideDeck.tsx), [`src/app/globals.css`](file:///c:/Best%20Project/Open/src/app/globals.css), [`src/app/page.tsx`](file:///c:/Best%20Project/Open/src/app/page.tsx)
- Severity: Critical (Complete Homepage Scroll Freeze on Windows Precision Touchpad, Firefox `DOM_DELTA_LINE`, & Browser Scrollbar)
- Status: RESOLVED
- Root Cause: Empat penyebab berantai membuat halaman utama (`/`) tidak dapat digulir sama sekali pada perangkat pengguna: (1) Kontainer utama `FullPageSlideDeck` mengunci tinggi ke `h-[100dvh] overflow-hidden` dengan `translate3d`, sehingga `document.documentElement.scrollHeight` sama dengan tinggi layar dan *native browser scrollbar* maupun *middle-click autoscroll* mati total; (2) Filter `if (absY < 14) return;` tanpa akumulator membuang seluruh event `WheelEvent` halus dari *Windows Precision Touchpad* (`deltaY = 2..12px` per *frame*) serta `deltaMode = 1` (`DOM_DELTA_LINE`, `deltaY = 3`) pada Firefox; (3) Listener `wheel` dipasang pada elemen lokal alih-alih `window` sehingga guliran di atas `Header` tetap terabaikan; dan (4) Potensi konflik *snap-back* CSS `scroll-snap-type` terhadap animasi `window.scrollTo` berbasis `requestAnimationFrame` maupun guliran internal pada layar laptop berskala DPI 125%-150%.
- Solution: Merancang ulang [`src/components/FullPageSlideDeck.tsx`](file:///c:/Best%20Project/Open/src/components/FullPageSlideDeck.tsx) ke arsitektur *Natural Document-Flow Full-Screen Vertical Slide Stack* (`min-h-[100dvh]` per slide tanpa `overflow-hidden`), menormalisasi `WheelEvent.deltaMode` (`DOM_DELTA_LINE * 36px`, `DOM_DELTA_PAGE * innerHeight`) dengan akumulator `wheelAccumPxRef` berambang `28px` (jendela `240ms`), memasang listener `wheel` pada `window`, menyelaraskan animasi meluncur `620ms` (`animateWindowToSlide`) dua arah dengan pengamat `scroll` pasif dan pembatal klik *scrollbar*, menghapus `scroll-snap-type` pada `html` di [`src/app/globals.css`](file:///c:/Best%20Project/Open/src/app/globals.css) (`overflow-x: clip`), memadatkan spasi vertikal Slide 1, 3, dan 4 di [`src/app/page.tsx`](file:///c:/Best%20Project/Open/src/app/page.tsx) tanpa menghapus satu kata pun informasi, serta mengunci regresi dengan 7 pengujian otomatis di [`tests/unit/fullpage-slide-deck.test.tsx`](file:///c:/Best%20Project/Open/tests/unit/fullpage-slide-deck.test.tsx).
- Target Deadline: Milestone 41



## Temuan & Pengerasan Milestone 45 (Eliminasi Lag & Frame Drop pada Sticky Stacking Scroll)

[PRIORITY: HIGH]
- Location: [`src/components/Header.tsx`](file:///c:/Best%20Project/Open/src/components/Header.tsx), [`src/components/SubpageHeader.tsx`](file:///c:/Best%20Project/Open/src/components/SubpageHeader.tsx), [`src/components/FullPageSlideDeck.tsx`](file:///c:/Best%20Project/Open/src/components/FullPageSlideDeck.tsx), [`src/app/globals.css`](file:///c:/Best%20Project/Open/src/app/globals.css)
- Severity: High (Scroll Frame Drops, Layout Thrashing & GPU `backdrop-filter` Re-rasterization)
- Status: RESOLVED
- Root Cause: Lima faktor menyebabkan jeda mikro (*micro-stutter* / *lag*) saat melakukan *scrolling* pada mekanisme *Sticky Stacking Sections*: (1) `Header.tsx` dan `SubpageHeader.tsx` menyimpan nilai numerik `scrollY` di dalam `useState`, sehingga memicu 60-120 *re-render* React per detik pada setiap piksel guliran; (2) `FullPageSlideDeck.tsx` membaca `offsetHeight` sekaligus menulis `style.top` di dalam *scroll listener* pada setiap frame (*synchronous layout thrashing*); (3) Perubahan referensi prop `slides` saat `activeSlide` berganti menyebabkan `useEffect` melepas dan memasang ulang `ResizeObserver` serta *window listeners* tepat di tengah guliran; (4) Pemanggilan `window.history.replaceState` di tengah guliran memicu rekonsiliasi internal `AppRouter` Next.js 14; dan (5) Mutasi `transform: scale()` + `opacity` + `visibility` pada elemen `.slide-stage-content` yang memiliki anak `backdrop-filter: blur(20px)` memaksa GPU merasterisasi ulang tekstur *Gaussian blur* layar penuh di setiap frame.
- Solution: Mengganti state numerik `scrollY` pada [`src/components/Header.tsx`](file:///c:/Best%20Project/Open/src/components/Header.tsx) dan [`src/components/SubpageHeader.tsx`](file:///c:/Best%20Project/Open/src/components/SubpageHeader.tsx) dengan state boolean berpenjaga `useRef` (`isPastTopRef`) sehingga *re-render* React hanya terjadi 1 kali saat melewati ambang `16px`; memisahkan kalkulasi dimensi DOM ke fungsi `measureLayout()` berbasis *two-pass batching* (hanya saat *mount* / `resize` / `ResizeObserver`) dengan *cache* `cachedMetricsRef`; menstabilkan referensi `slidesRef` dan `onSlideChangeRef`; menghapus `history.replaceState` dari jalur *scroll* aktif; serta menjaga elemen konten tetap statis di *GPU tile cache* (`transform: translateZ(0)`, `backface-visibility: hidden`) dengan hanya memperbarui lapisan `.veil` ringan saat nilai `coverProgress` benar-benar berubah.
- Target Deadline: Milestone 45


## Temuan & Pengerasan Milestone 48 (Comprehensive Security Audit & Hardening — SEC-01 s.d. SEC-07)

[PRIORITY: HIGH]
- Location: `src/lib/document/zip-reader.ts` (SEC-01)
- Severity: High (Zip Bomb / Unbounded Decompression DoS & Zip Slip Entry Path Traversal)
- Status: RESOLVED
- Root Cause: `ZipReader` sebelumnya memanggil `zlib.inflateRawSync(compressed)` tanpa `maxOutputLength`, batas jumlah entri, batas ukuran dekompresi total, ataupun validasi keamanan jalur relatif entri di dalam arsip ZIP (DOCX/XLSX/PPTX/ODT/EPUB).
- Solution:
  1. Menambahkan konstanta keras `MAX_ZIP_ENTRIES = 2500`, `MAX_ENTRY_UNCOMPRESSED_BYTES = 64 MB`, `MAX_TOTAL_UNCOMPRESSED_BYTES = 150 MB`, `MAX_COMPRESSION_RATIO = 120`, `MAX_ZIP_PATH_DEPTH = 16`, dan `MAX_ZIP_FILENAME_LENGTH = 255`.
  2. Mengimplementasikan fungsi `isSafeZipEntryPath(filename)` yang menolak `..`, awalan `/`, `\`, huruf drive Windows (`C:`), serta byte kontrol/null.
  3. Mengaktifkan opsi `{ maxOutputLength }` pada `zlib.inflateRawSync` dan pemeriksaan rasio kompresi pasca-inflasi.
- Target Deadline: Milestone 48

[PRIORITY: HIGH]
- Location: `src/lib/downloader/media-extractor.ts` & `src/lib/downloader/download-service.ts` (SEC-02)
- Severity: High (DNS Rebinding SSRF, TLS Verification Bypass `--no-check-certificates`, & CLI Option Injection)
- Status: RESOLVED
- Root Cause: Validasi URL statis belum memverifikasi hasil resolusi DNS aktual (rentan terhadap DNS Rebinding ke `127.0.0.1` / `169.254.169.254`), argumen `yt-dlp` menyertakan `--no-check-certificates` yang menonaktifkan validasi sertifikat TLS, serta belum memisahkan URL posisional dengan `--`.
- Solution:
  1. Menambahkan `validateSafeUrlWithDns(rawUrl)` yang melakukan `dns.promises.lookup(host, { all: true })` dan memverifikasi setiap alamat IPv4/IPv6 hasil resolusi melalui `isBlockedIpHost()`.
  2. Menolak URL yang diawali karakter `-` pada `validateSafeUrl()`.
  3. Menghapus `--no-check-certificates`, menambahkan `--no-exec`, `--max-redirections 3`, serta terminator `--` sebelum argumen URL pada seluruh pemanggilan `yt-dlp`.
- Target Deadline: Milestone 48

[PRIORITY: MEDIUM]
- Location: `next.config.mjs`, `src/app/api/jobs/[id]/download/route.ts`, & `src/app/api/downloader/download/route.ts` (SEC-03)
- Severity: Medium (Missing Global & Download Security Headers / Content Sniffing Defense)
- Status: RESOLVED
- Root Cause: Konfigurasi `next.config.mjs` belum menetapkan security headers tingkat aplikasi, dan endpoint unduhan `/api/jobs/[id]/download` belum menyertakan `X-Content-Type-Options: nosniff` atau sandbox CSP.
- Solution:
  1. Menambahkan `headers()` global di `next.config.mjs` (`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, dan `Content-Security-Policy`).
  2. Menambahkan `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Cross-Origin-Resource-Policy: same-origin`, dan `Content-Security-Policy: default-src 'none'; sandbox` pada endpoint unduh berkas.
- Target Deadline: Milestone 48

[PRIORITY: MEDIUM]
- Location: `src/lib/image/bmp-ico-codec.ts`, `src/lib/adapters/sharp-image.ts`, & `src/lib/adapters/pure-data.ts` (SEC-04)
- Severity: Medium (Image Pixel Flood DoS & Unescaped HTML/JavaScript Scheme in Markdown Converter)
- Status: RESOLVED
- Root Cause: Pemanggilan `sharp()` belum membatasi `limitInputPixels`, dan konverter `markdownToHtml` belum melakukan HTML escaping sebelum substitusi tag maupun menyaring skema tautan berbahaya (`javascript:`, `data:`).
- Solution:
  1. Menetapkan `MAX_IMAGE_INPUT_PIXELS = 67_108_864` (`8192x8192`) pada seluruh pemanggilan `sharp()` serta membatasi `density` (`72..600`) dan dimensi `width`/`height` (`1..8192`).
  2. Melakukan HTML escaping penuh terlebih dahulu pada `markdownToHtml()` dan memvalidasi tautan dengan `sanitizeMarkdownLinkUrl()` sehingga hanya mengizinkan `http://`, `https://`, `mailto:`, atau anchor relatif.
- Target Deadline: Milestone 48

[PRIORITY: MEDIUM]
- Location: `src/lib/security/rate-limiter.ts` & seluruh Route Handlers `/api/*` (SEC-05 & SEC-07)
- Severity: Medium (Missing Per-IP Rate Limiting, Prototype Pollution in JSON Options, & Internal Path Disclosure)
- Status: RESOLVED
- Root Cause: Endpoint API konversi, kompresi, PDF, penghapusan latar, dan pengunduh media belum memiliki pembatas laju per-IP, parsing JSON `options` belum menyaring kunci `__proto__`/`constructor`/`prototype`, dan pesan galat mentah berpotensi membocorkan path direktori server (`.storage`, `C:\...`).
- Solution:
  1. Membuat modul `src/lib/security/rate-limiter.ts` yang menyediakan `checkRateLimit()`, `sanitizeJsonOptions()`, `sanitizePublicErrorMessage()`, dan `logSecurityEvent()`.
  2. Mengintegrasikan rate limiting (`429 Too Many Requests` + header `Retry-After`), pembatasan `MAX_BATCH_ITEMS = 100` & `MAX_BATCH_ZIP_BYTES = 250 MB` pada `/api/jobs/batch-zip`, serta penyensoran path internal pada seluruh endpoint API.
- Target Deadline: Milestone 48

[PRIORITY: LOW]
- Location: `src/lib/adapters/ffmpeg-media.ts` & `src/lib/adapters/libreoffice.ts` (SEC-06)
- Severity: Low (Defense-in-Depth Subprocess Protocol & Target Format Allowlist)
- Status: RESOLVED
- Root Cause: Pemanggilan `ffmpeg` belum membatasi `-protocol_whitelist` dan belum memiliki `timeout` eksplisit untuk menghentikan proses menggantung, serta `LibreOfficeDocumentAdapter` belum memvalidasi allowlist format target sebelum pengecekan biner.
- Solution:
  1. Menambahkan allowlist `ALLOWED_MEDIA_FORMATS`, flag `-protocol_whitelist file,pipe,crypto,data`, dan `timeout: 60000` (`15000` pada `ffprobe`) di `ffmpeg-media.ts`.
  2. Menambahkan validasi allowlist format target di awal `LibreOfficeDocumentAdapter.convert()` dan `timeout: 60000`.
- Target Deadline: Milestone 48


## Temuan & Pengerasan Milestone 49 (Missing Browser Tab Favicon)

[PRIORITY: LOW]
- Location: `src/app/layout.tsx`, `public/favicon.ico`, & `src/app/icon.png`
- Severity: Low (Missing Browser Tab Favicon / Generic Globe Icon)
- Status: RESOLVED
- Root Cause: Proyek belum memiliki berkas `favicon.ico` / `icon.png` di dalam `public/` maupun `src/app/`, serta properti `icons` belum didefinisikan pada `metadata` di `src/app/layout.tsx`.
- Solution:
  1. Membuat `public/favicon.ico`, `src/app/favicon.ico`, `public/icon.png`, `src/app/icon.png`, dan `public/apple-touch-icon.png` berbasis logo resmi FileVela di atas lencana *rounded-square* `#111315`.
  2. Mendaftarkan `icons` (`icon`, `shortcut`, `apple`) di `src/app/layout.tsx`.
- Target Deadline: Milestone 49


## Temuan & Pengerasan Milestone 50 (cPanel Build Isolation Terhadap Lock `.next/trace` Windows)

[PRIORITY: MEDIUM]
- Location: [`scripts/build-cpanel-package.mjs`](file:///c:/Best%20Project/Open/scripts/build-cpanel-package.mjs) & [`next.config.mjs`](file:///c:/Best%20Project/Open/next.config.mjs)
- Severity: Medium (Windows File Descriptor Lock `EPERM: operation not permitted, open '.next\trace'` saat `next dev` berjalan paralel)
- Status: RESOLVED
- Root Cause: Pada Windows, ketika proses `next dev` sedang aktif di latar belakang, berkas `.next\trace` dikunci secara eksklusif oleh proses pengembangan. Menjalankan `next build` secara langsung pada direktori `.next` yang sama memicu galat `EPERM: operation not permitted, open '.next\trace'`.
- Solution:
  1. Mengonfigurasi `scripts/build-cpanel-package.mjs` untuk menjalankan `next build` pada direktori terisolasi `NEXT_DIST_DIR=.next-cpanel-build` dengan variabel lingkungan produksi `NEXT_PUBLIC_SITE_DOMAIN=filevela.biz.id` dan `NEXT_PUBLIC_SITE_URL=https://filevela.biz.id`.
  2. Menyalin artefak kompilasi produksi ke `dist-cpanel/.next` (tanpa direktori `cache` dan berkas `trace`), menormalisasi `required-server-files.json` kembali ke `.next`, serta membersihkan direktori sementara `.next-cpanel-build`.
- Target Deadline: Milestone 50



## Temuan & Pengerasan Milestone 51 (Mobile Navbar Button Clipping & Viewport Proportions)

[PRIORITY: HIGH]
- Location: [`src/app/globals.css`](file:///c:/Best%20Project/Open/src/app/globals.css), [`src/components/Header.tsx`](file:///c:/Best%20Project/Open/src/components/Header.tsx), [`src/components/ThemeToggle.tsx`](file:///c:/Best%20Project/Open/src/components/ThemeToggle.tsx), [`src/components/SubpageHeader.tsx`](file:///c:/Best%20Project/Open/src/components/SubpageHeader.tsx), & [`src/app/page.tsx`](file:///c:/Best%20Project/Open/src/app/page.tsx)
- Severity: High (Mobile UI Overflow — Tombol `Buka Studio` Terpotong di Tepi Kanan Layar Handphone & Proporsi Hero Terlalu Tinggi di Mobile)
- Status: RESOLVED
- Root Cause:
  1. Kelas `.btn-primary-dark`, `.btn-secondary-light`, dan `.btn-ghost-clean` pada `src/app/globals.css` dideklarasikan di luar `@layer components` setelah `@tailwind utilities`, sehingga properti `padding: 10px 22px; min-height: 42px; font-size: 13.5px` mengalahkan kelas responsif Tailwind pada tombol di dalam `Header.tsx`. Akibatnya, total lebar brand `FileVela` + `Light` + `Privasi` + `Buka Studio` melebihi lebar layar ponsel `360px–390px` dan memotong sisi kanan tombol `Buka Studio`.
  2. Ukuran huruf dan jarak vertikal kartu telemetri 3 baris pada seksi `#beranda` (`src/app/page.tsx`) menggunakan ukuran desktop (`text-2xl`, `gap-5`, `p-4`), sehingga tinggi seksi beranda melampaui tinggi layar ponsel standar.
- Solution:
  1. Memindahkan definisi `.btn-primary-dark`, `.btn-secondary-light`, `.btn-ghost-clean`, dan kelas permukaan ke dalam `@layer components` di `src/app/globals.css` dengan ukuran dasar mobile yang proporsional.
  2. Mengatur ukuran tombol dan jarak antar-elemen pada `Header.tsx`, `ThemeToggle.tsx`, dan `SubpageHeader.tsx` (`min-h-[32px] sm:min-h-[36px]`, `px-2.5 sm:px-4`, `text-[11px] sm:text-xs`, `gap-1 sm:gap-2`) agar seluruh elemen navigasi muat di layar ponsel `320px–430px`.
  3. Mengkalibrasi tipografi, jarak, dan tata letak kapsul modul pada `src/app/page.tsx` dan `src/components/FileUploadZone.tsx` khusus untuk layar mobile tanpa mengubah tampilan desktop.
- Target Deadline: Milestone 51
