# Project: FileFlow — Universal File Conversion & Background Removal Web Application

## Architecture

FileFlow is a production-minded web application engineered with Next.js 14 App Router, TypeScript (Strict Mode), and Tailwind CSS. The application adheres to Spec-Driven Development (SDD), honest capability discovery, secure ephemeral storage, and zero fake format conversions.

### High-Level System Architecture
```
                                 [ Browser / Client UI ]
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
          [ Front-end Components ]                      [ Direct File Upload ]
        - FileUploadZone (DnD)                         (Multipart FormData)
        - FormatSelector (Dynamic)                                 │
        - CheckerboardPreview                                      ▼
        - JobStatusPanel                                [ Route Handlers / API ]
        - SupportedFormatsModal                         - GET /api/health
                     │                                  - GET /api/capabilities
                     │ (Fetch / Polling)                - POST /api/jobs
                     └─────────────────────────────────►- GET /api/jobs/{id}
                                                        - GET /api/jobs/{id}/download
                                                        - DELETE /api/jobs/{id}
                                                        - POST /api/background-removal
                                                                   │
                                           ┌───────────────────────┴───────────────────────┐
                                           ▼                                               ▼
                              [ Capabilities & Adapters ]                    [ Core Engine & Security ]
                              - CapabilityRegistry                           - MagicBytes Sniffer
                              - SharpImageAdapter (Active)                   - PathSanitizer & Guard
                              - FFmpegMediaAdapter (Active)                  - OwnerToken Authenticator
                              - PureDataAdapter (Active)                     - PrivateStorage (.storage/)
                              - LibreOfficeAdapter (Honest Inactive)         - Ephemeral Cleanup Sweeper
                              - BgRemovalProvider (Local Alpha / Cloud)
```

### Module Boundaries
1. **Core Infrastructure & Security (`src/lib/security`, `src/lib/storage`)**:
   - Manages private isolated job folders in `.storage/jobs/{id}/`.
   - Normalizes filenames and rejects path traversal attempts.
   - Enforces cryptographic `ownerToken` validation for all read/download/delete endpoints.
   - Sniffs content signatures (magic bytes) to prevent extension deception.
   - Runs automated TTL garbage collection for files older than retention policy.

2. **Capabilities & Adapter System (`src/lib/adapters`)**:
   - `IConversionAdapter` interface contract: `isAvailable()`, `getSupportedSources()`, `getSupportedTargets()`, `convert()`.
   - `CapabilityRegistry` queries registered adapters at runtime.
   - `/api/capabilities` returns only genuinely supported target formats with active engines.

3. **Background Removal System (`src/lib/bg-removal`)**:
   - `IBackgroundRemovalProvider` interface contract.
   - `SharpChromaLocalProvider`: Local algorithmic alpha channel transparency extractor guaranteeing authentic transparent RGBA PNG output without external dependencies.
   - `CloudAIProvider`: Optional provider with honest unconfigured reporting if API key is missing.

4. **Job Lifecycle Engine (`src/lib/jobs`)**:
   - Tracks state machine: `queued` -> `processing` -> `succeeded` | `failed` -> `expired`.
   - Coordinates asynchronous job processing, error sanitization, and output metadata.

5. **Indonesian Web UI (`src/app`, `src/components`)**:
   - Responsive, accessible interface in formal Bahasa Indonesia.
   - Drag-and-drop dropzone, client pre-validation, reactive format dropdown.
   - 20px CSS checkerboard transparency preview viewer.
   - Honest status badges, progress indicator, download action, and manual file purge.

---

## Code Layout

```
c:\Best Project\Open\
├── .storage/                      # Private ephemeral storage (outside public/)
│   └── jobs/                      # Isolated directory per job
│       └── {jobId}/
│           ├── meta.json          # Job status, ownerTokenHash, timestamps
│           ├── input/             # Cleaned source file
│           └── output/            # Converted / transparent output file
├── src/
│   ├── app/                       # Next.js 14 App Router
│   │   ├── layout.tsx             # Root layout with HTML/metadata
│   │   ├── page.tsx               # Main Indonesian landing page
│   │   ├── globals.css            # Tailwind directives & CSS checkerboard
│   │   └── api/                   # Server-side Route Handlers
│   │       ├── health/route.ts
│   │       ├── capabilities/route.ts
│   │       ├── jobs/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       ├── route.ts
│   │       │       └── download/route.ts
│   │       └── background-removal/route.ts
│   ├── components/                # Reusable React Server & Client Components
│   │   ├── common/                # Header, Footer, Navbar, Modal
│   │   ├── upload/                # FileUploadZone, FileInfoCard
│   │   ├── converter/             # FormatSelector, ConversionOptions
│   │   ├── background-remover/    # CheckerboardPreview, TransparencyToggle
│   │   └── job/                   # JobStatusPanel, ProgressBar, DownloadCard
│   └── lib/                       # Backend Infrastructure & Business Logic
│       ├── adapters/              # Adapter Registry & Implementations
│       │   ├── types.ts
│       │   ├── registry.ts
│       │   ├── sharp-image.ts
│       │   ├── ffmpeg-media.ts
│       │   ├── pure-data.ts
│       │   └── libreoffice.ts
│       ├── bg-removal/            # Background Removal Providers
│       │   ├── types.ts
│       │   ├── sharp-local.ts
│       │   └── cloud-ai.ts
│       ├── storage/               # Ephemeral Storage Management
│       │   ├── temp-storage.ts
│       │   ├── path-sanitizer.ts
│       │   └── cleanup-cron.ts
│       ├── security/              # Security Guards
│       │   ├── token-auth.ts
│       │   └── mime-detector.ts
│       └── config/                # Environment & Constants
└── tests/                         # Automated Verification Test Suite
    ├── unit/                      # Isolated unit tests
    │   ├── registry.test.ts
    │   ├── mime-detector.test.ts
    │   ├── sanitizer.test.ts
    │   └── token-auth.test.ts
    ├── integration/               # API & execution integration tests
    │   ├── capabilities-api.test.ts
    │   ├── conversion-execution.test.ts
    │   ├── bg-removal.test.ts
    │   ├── job-lifecycle.test.ts
    │   └── storage-cleanup.test.ts
    └── e2e/                       # End-to-end user requirement test suite
        ├── tiers/
        │   ├── tier1-features.test.ts
        │   ├── tier2-boundaries.test.ts
        │   ├── tier3-combinations.test.ts
        │   └── tier4-scenarios.test.ts
        └── adversarial/
            └── tier5-adversarial.test.ts
```

---

## Feature Inventory

Every feature identified during the Survey phase is enumerated below with its assigned milestone:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Server-side Magic Bytes Inspection | Inspect binary headers (magic bytes) to determine real MIME type rather than trusting user extension | M1 | Survey 1 & 3 |
| 2 | Filename Normalization & Path Sanitization | Sanitize uploaded filenames via `path.basename` and regex, preventing path traversal and shell injection | M1 | Survey 1 & 3 |
| 3 | Private Storage Partitioning | Store upload and output files in isolated private directory `.storage/jobs/{id}/` outside `public/` | M1 | Survey 1 & 3 |
| 4 | Owner Token Authentication Model | Cryptographic 64-character owner token generated per job to prevent unauthorized IDOR downloads | M1 | Survey 1 & 3 |
| 5 | Health Check Endpoint (`GET /api/health`) | Endpoint returning service health, uptime, and engine availability | M1 | Survey 1 |
| 6 | Extensible Adapter Registry Architecture | Pluggable `IConversionAdapter` interface and registry querying active engines at runtime | M1 | Survey 1 & 3 |
| 7 | Dynamic Capabilities API (`GET /api/capabilities`) | Endpoint returning only genuinely supported target formats for a given source format | M1 | Survey 1 & 3 |
| 8 | Sharp Image Conversion Adapter | Converts raster images (PNG, JPG, WEBP, AVIF, TIFF, GIF) authenticating real format conversion | M2 | Survey 1 & 3 |
| 9 | FFmpeg Media Conversion Adapter | Converts audio and video formats (MP4, WEBM, MP3, WAV) via installed system FFmpeg | M2 | Survey 1 & 3 |
| 10 | Pure Data Conversion Adapter | Converts structured data files (JSON <-> CSV, JSON <-> YAML) in pure TypeScript | M2 | Survey 1 & 3 |
| 11 | LibreOffice Document Adapter (Honest Inactive) | Probes `soffice`; reports honest unconfigured status and setup guide when engine is absent | M2 | Survey 1 & 3 |
| 12 | Asynchronous Job Creation API (`POST /api/jobs`) | Accepts multipart file and target format, initializes job, saves file in private storage, starts worker | M2 | Survey 1 |
| 13 | Job Status Polling API (`GET /api/jobs/{id}`) | Returns current job state (`queued`, `processing`, `succeeded`, `failed`, `expired`) with owner validation | M2 | Survey 1 |
| 14 | Authorized Download API (`GET /api/jobs/{id}/download`)| Serves converted file stream with proper Content-Disposition only upon valid token verification | M2 | Survey 1 & 3 |
| 15 | On-Demand Job Deletion API (`DELETE /api/jobs/{id}`) | Permanently deletes job storage directory and meta upon user request with token authorization | M2 | Survey 1 & 3 |
| 16 | Background Removal API (`POST /api/background-removal`)| Endpoint accepting image, performing background removal, and outputting transparent PNG | M2 | Survey 1 & 3 |
| 17 | Local Algorithmic Alpha Channel Extractor | Local Sharp provider extracting background color and outputting verifiable RGBA transparent PNG | M2 | Survey 1 & 3 |
| 18 | Cloud AI Background Removal Stub & Notice | Optional cloud AI provider returning honest 503 setup instructions if API key is unconfigured | M2 | Survey 1 & 3 |
| 19 | Ephemeral Storage Auto-Cleanup Sweeper | Background interval sweeper purging job folders older than retention TTL (default: 60 minutes) | M2 | Survey 1 & 3 |
| 20 | Navigation & Brand Header UI | Indonesian header with "FileFlow" wordmark, navigation tabs, and link to supported formats | M3 | Survey 2 |
| 21 | Hero Section & Indonesian Copy | Headline: "Semua kebutuhan file, di satu tempat." Subheadline: "Konversi format yang didukung..." | M3 | Survey 2 |
| 22 | Drag-and-Drop Dropzone UI | Accessible drag-and-drop zone with upload icon, file picker button, size limits, and format guide | M3 | Survey 2 |
| 23 | File Picker Trigger UI | Standard HTML file input trigger accessible via click or keyboard activation | M3 | Survey 2 |
| 24 | Client-side Size Pre-validation | Immediate rejection of files exceeding configured max limit (50 MB) with Indonesian error banner | M3 | Survey 2 |
| 25 | Client-side Empty File Rejection | Immediate client rejection of 0-byte files | M3 | Survey 2 |
| 26 | Client-side File Metadata Display | Displays sanitized filename, human-readable size (KB/MB), and detected format badge | M3 | Survey 2 |
| 27 | File Replacement & Reset Action | Buttons to change file or reset workflow before conversion | M3 | Survey 2 |
| 28 | Dynamic Target Format Dropdown UI | Reactively queries `/api/capabilities?source={format}` to populate only genuine target formats | M3 | Survey 2 |
| 29 | Checkerboard Transparency Preview UI | Renders transparent PNG output over 20px CSS checkerboard pattern to visualize transparency | M3 | Survey 2 |
| 30 | Job Progress & Status Tracker UI | Real-time status badge (Menunggu, Diproses, Berhasil, Gagal), spinner, and Indonesian error notices | M3 | Survey 2 |
| 31 | Result Actions (Download, Delete, Reset) UI | "Unduh hasil", "Hapus file sekarang", and "Proses file lain" buttons with expiration countdown | M3 | Survey 2 |
| 32 | Supported Formats ("Format didukung") Modal UI | Interactive dialog/modal detailing active vs inactive adapters and setup instructions | M3 | Survey 2 |
| 33 | Responsive Layout (Mobile/Tablet/Desktop) | Fluid responsive layout supporting screens from <640px to >1024px | M3 | Survey 2 |
| 34 | WCAG 2.2 AA Accessibility & Keyboard Nav | Visible focus rings, ARIA live regions for async status updates, keyboard trap mitigation | M3 | Survey 2 |
| 35 | E2E Test Suite (Tiers 1-4) | Comprehensive opaque-box test suite verifying 100% of functional requirements | M4 (E2E Track) | Survey 1 & 3 |
| 36 | Adversarial Coverage Hardening (Tier 5) | White-box adversarial stress tests covering edge cases, race conditions, and malformed inputs | M4 | Project Pattern |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Infrastructure, Storage & Capabilities Registry | Next.js 14 App Router project setup, TypeScript strict config, Tailwind CSS, private storage `.storage/`, path sanitizer, magic bytes MIME detector, token security, base adapter interfaces, CapabilityRegistry, `GET /api/capabilities`, `GET /api/health`. | none | IN_PROGRESS |
| M2 | Conversion Adapters, Background Removal & Job Engine | Concrete adapters (`SharpImageAdapter`, `FFmpegMediaAdapter`, `PureDataAdapter`, `LibreOfficeDocumentAdapter`), local Sharp background remover with verified alpha channel transparency, job lifecycle state machine, Route Handlers (`POST /api/jobs`, `POST /api/background-removal`, `GET /api/jobs/{id}`, `GET /api/jobs/{id}/download`, `DELETE /api/jobs/{id}`), TTL auto-cleanup sweeper. | M1 | PLANNED |
| M3 | Indonesian Web UI & Responsive User Experience | Complete Indonesian UI: Header, Hero, FileUploadZone, FormatSelector, CheckerboardPreview, JobStatusPanel, ResultDownloadCard, SupportedFormatsModal, responsive layout, WCAG 2.2 AA accessibility, full API wiring. | M2 | PLANNED |
| M4 | Final Milestone: E2E Test Suite Pass (Tiers 1-4) & Adversarial Hardening (Tier 5) | Phase 1: Pass 100% of E2E Test Suite (Tiers 1-4) created by parallel E2E Testing Track. Phase 2: Adversarial coverage hardening (Tier 5) via Challenger -> Worker -> Reviewer loop. | M3, TEST_READY.md | PLANNED |

### Parallel Track: E2E Testing Track
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | Requirement-Driven Opaque-Box Test Suite | Test runner infrastructure (Vitest), synthetic test fixtures, Tier 1 Feature Coverage (>=5 per feature), Tier 2 Boundary Cases, Tier 3 Pairwise Combinations, Tier 4 Real-World Application Scenarios. Generates `TEST_INFRA.md` and publishes `TEST_READY.md`. | M1 (Interface Contracts) | PLANNED |

---

## Interface Contracts

### 1. Adapter Contract: `src/lib/adapters/types.ts`
```ts
export type FileCategory = 'image' | 'document' | 'audio' | 'video' | 'data';

export interface FormatCapability {
  format: string;             // e.g. 'png', 'webp', 'pdf', 'mp4'
  label: string;              // e.g. 'PNG (Portable Network Graphics)'
  mimeType: string;           // e.g. 'image/png'
  category: FileCategory;
  extension: string;
}

export interface ConversionTarget {
  targetFormat: string;
  label: string;
  mimeType: string;
  adapterId: string;
  isAvailable: boolean;
  statusReason?: string;
  optionsSchema?: Record<string, any>;
}

export interface IConversionAdapter {
  readonly id: string;
  readonly name: string;
  readonly category: FileCategory;
  
  isAvailable(): Promise<boolean>;
  getSetupInstructions(): string;
  getSupportedSources(): string[];
  getSupportedTargets(sourceFormat: string): Promise<ConversionTarget[]>;
  convert(
    inputPath: string,
    outputPath: string,
    sourceFormat: string,
    targetFormat: string,
    options?: Record<string, any>
  ): Promise<{ outputBytes: number; mimeType: string }>;
}
```

### 2. Capabilities API Contract: `GET /api/capabilities?source={format}`
- Request: `GET /api/capabilities?source=png`
- Success Response (200 OK):
```json
{
  "source": {
    "format": "png",
    "mimeType": "image/png",
    "category": "image"
  },
  "targets": [
    { "targetFormat": "jpg", "label": "JPEG / JPG", "mimeType": "image/jpeg", "adapterId": "sharp-image-adapter", "isAvailable": true },
    { "targetFormat": "webp", "label": "WebP", "mimeType": "image/webp", "adapterId": "sharp-image-adapter", "isAvailable": true },
    { "targetFormat": "avif", "label": "AVIF", "mimeType": "image/avif", "adapterId": "sharp-image-adapter", "isAvailable": true }
  ],
  "unavailableAdapters": []
}
```

### 3. Job Lifecycle API Contract:
- **`POST /api/jobs`**:
  - Request: `multipart/form-data` with `file` and `targetFormat`
  - Response (201 Created):
    ```json
    {
      "jobId": "3a28f8d2-43bb-4d51-a9f8-b80c57099a8f",
      "ownerToken": "7f9a8b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a",
      "status": "queued",
      "sourceFormat": "png",
      "targetFormat": "webp",
      "originalFilename": "sample.png",
      "createdAt": "2026-10-29T01:10:00Z"
    }
    ```
- **`GET /api/jobs/{id}`**:
  - Headers: `X-Session-Token: <ownerToken>` (or query param `?token=<ownerToken>`)
  - Response (200 OK):
    ```json
    {
      "jobId": "3a28f8d2-43bb-4d51-a9f8-b80c57099a8f",
      "status": "succeeded",
      "sourceFormat": "png",
      "targetFormat": "webp",
      "outputFilename": "sample.webp",
      "outputSizeBytes": 145020,
      "expiresAt": "2026-10-29T02:10:00Z"
    }
    ```
- **`GET /api/jobs/{id}/download`**:
  - Headers: `X-Session-Token: <ownerToken>` (or query param `?token=<ownerToken>`)
  - Returns binary file stream with `Content-Type: image/webp` and `Content-Disposition: attachment; filename="sample.webp"`.
- **`DELETE /api/jobs/{id}`**:
  - Headers: `X-Session-Token: <ownerToken>`
  - Response (200 OK): `{ "success": true, "message": "Job dan file berhasil dihapus." }`

### 4. Background Removal API Contract:
- **`POST /api/background-removal`**:
  - Request: `multipart/form-data` with `file`
  - Response (201 Created):
    ```json
    {
      "jobId": "c8a1b2d3-...",
      "ownerToken": "...",
      "status": "succeeded",
      "outputFormat": "png",
      "outputFilename": "photo_transparent.png",
      "isTransparent": true,
      "previewUrl": "/api/jobs/c8a1b2d3-.../download?token=..."
    }
    ```

---

## Anti-Deception & Integrity Guarantees

1. Zero extension renaming: every conversion produces authentic converted binary structures verified by magic byte inspection.
2. Honest capability reporting: if an external binary (e.g. LibreOffice) is missing, the API reports inactive status with actionable setup instructions.
3. Programmatic alpha transparency: background removal guarantees genuine RGBA transparency verified by inspection of the alpha channel pixels.
4. Ephemeral private storage: files are never stored in public directories and are purged automatically or on-demand.
