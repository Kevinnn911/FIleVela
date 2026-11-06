# Design System — FileFlow (Sunlit Porcelain & Coastal Glass Architecture)

## Aesthetic Direction
FileFlow mengadopsi bahasa desain **Sunlit Porcelain & Coastal Glass**: ruang kanvas putih murni (`#ffffff`) dan porselen lembut (`#f6f8fb`) yang tenang, bersih, dan bebas dekorasi berlebih, dipadukan dengan tipografi neo-grotesk modern `Onest`, tombol kapsul hitam pekat matte (`#111315`), serta kartu kaca buram (`.surface-glass`) yang mengapung di atas cakrawala riak air pesisir biru lembut (`public/images/coastal-horizon.webp`). Halaman utama menggunakan **Full-Screen Vertical Scroll Snapping** (`100dvh` slide-by-slide transitions) yang terbagi menjadi 5 panggung penuh.

## Color Tokens
- `--canvas`: `#ffffff` (Kanvas putih murni utama seluruh halaman)
- `--porcelain`: `#f6f8fb` (Permukaan bento kapabilitas, toolbar sekunder, dan zona drop)
- `--porcelain-hover`: `#eef2f7` (Permukaan kontrol sekunder saat hover)
- `--ink`: `#0a0d14` (Teks primer obsidian, rasio kontras > 18:1 AAA terhadap `--canvas`)
- `--ink-secondary`: `#4e5666` (Teks sekunder dan keterangan teknis, rasio kontras > 7.4:1 AAA terhadap `--canvas`)
- `--ink-tertiary`: `#6c7586` (Teks placeholder dan petunjuk halus, rasio kontras >= 4.7:1 AA)
- `--accent-blue`: `#2563eb` (Aksen indikator aktif, fokus cincin, dan penanda bagian Title Case)
- `--line`: `rgba(15, 23, 42, 0.08)` (Garis pemisah struktural 1px halus)
- `--line-strong`: `rgba(15, 23, 42, 0.16)` (Garis batas saat fokus atau hover)

## Typography
- **Primary Display & UI**: `Onest` (`--font-onest`, bobot `400..700`), geometri huruf bersih dengan tracking `-0.035em` pada tajuk editorial utama dan `-0.011em` pada teks antarmuka.
- **Technical & Telemetry**: `JetBrains Mono` (`--font-jetbrains-mono`) dengan `font-variant-numeric: tabular-nums` khusus untuk ukuran byte, ekstensi berkas, durasi milidetik, dan kode endpoint API.

## Surface, Motion & Slide Deck Architecture
1. **Full-Screen Vertical Slide Deck (`FullPageSlideDeck.tsx`)**: Lima panggung penuh `100dvh` (`#beranda`, `#studio`, `#fitur`, `#privasi`, `#faq`) dengan fisika satu langkah per gestur wheel/swipe/keyboard (`680ms cubic-bezier(0.22, 1, 0.36, 1)`), indikator titik minimalis di sisi kanan layar, dan pelindung scroll bersarang (`[data-slide-scrollable]`).
2. **Top Navigation Bar (`Header.tsx`)**: Tinggi `64px` (`bg-white/88` dengan `backdrop-filter: blur(20px)`), markah geometris monokrom `#111315`, navigasi slide terpusat, kapsul `Mode Privasi`, dan tombol utama hitam pekat `Buka Studio`.
3. **Hero & Coastal Glass Stage (`#beranda`)**: Tajuk editorial terpusat dengan tombol kapsul ganda (`.btn-primary-dark` `#111315` dan `.btn-secondary-light` `#f1f4f9`) di atas kartu telemetri kaca buram 3 kolom yang bertumpu pada `.coastal-horizon-band`.
4. **Workstation Stage (`#studio`) & Bento Capabilities (`#fitur`)**: Kapsul pemilih 5 modul dengan status aktif hitam matte `#111315` di atas `.surface-elevated` putih bersih, diikuti kisi bento 2x2 `.surface-porcelain` berpratinjau mini-UI putih dan switcher interaktif 3 kolom `.coastal-frame` pada `#privasi`.
