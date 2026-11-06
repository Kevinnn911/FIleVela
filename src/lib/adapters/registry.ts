// File: src/lib/adapters/registry.ts

import { FFmpegMediaAdapter } from "./ffmpeg-media";
import { LibreOfficeDocumentAdapter } from "./libreoffice";
import { PureDataAdapter } from "./pure-data";
import { SharpImageAdapter } from "./sharp-image";
import { UniversalOfficeDocumentAdapter } from "./office-document";
import {
  AdapterStatus,
  CapabilitiesCatalogResponse,
  CategorySummary,
  ConversionResult,
  ConversionTarget,
  FileCategory,
  FormatCapability,
  IConversionAdapter,
  UnavailableAdapterNotice,
} from "./types";

export const KNOWN_FORMAT_CATALOG: Record<string, FormatCapability> = {
  png: {
    format: "png",
    label: "Portable Network Graphics (PNG)",
    mimeType: "image/png",
    category: "image",
    extension: ".png",
  },
  jpg: {
    format: "jpg",
    label: "JPEG Image (JPG)",
    mimeType: "image/jpeg",
    category: "image",
    extension: ".jpg",
  },
  jpeg: {
    format: "jpeg",
    label: "JPEG Image (JPEG)",
    mimeType: "image/jpeg",
    category: "image",
    extension: ".jpeg",
  },
  webp: {
    format: "webp",
    label: "WebP Image (WEBP)",
    mimeType: "image/webp",
    category: "image",
    extension: ".webp",
  },
  avif: {
    format: "avif",
    label: "AV1 Image File Format (AVIF)",
    mimeType: "image/avif",
    category: "image",
    extension: ".avif",
  },
  tiff: {
    format: "tiff",
    label: "Tagged Image File Format (TIFF)",
    mimeType: "image/tiff",
    category: "image",
    extension: ".tiff",
  },
  gif: {
    format: "gif",
    label: "Graphics Interchange Format (GIF)",
    mimeType: "image/gif",
    category: "image",
    extension: ".gif",
  },
  bmp: {
    format: "bmp",
    label: "Bitmap Image (BMP)",
    mimeType: "image/bmp",
    category: "image",
    extension: ".bmp",
  },
  svg: {
    format: "svg",
    label: "Scalable Vector Graphics (SVG)",
    mimeType: "image/svg+xml",
    category: "image",
    extension: ".svg",
  },
  ico: {
    format: "ico",
    label: "Windows Icon / Favicon (ICO)",
    mimeType: "image/x-icon",
    category: "image",
    extension: ".ico",
  },
  mp4: {
    format: "mp4",
    label: "MPEG-4 Video (MP4)",
    mimeType: "video/mp4",
    category: "video",
    extension: ".mp4",
  },
  webm: {
    format: "webm",
    label: "WebM Video / Audio (WEBM)",
    mimeType: "video/webm",
    category: "video",
    extension: ".webm",
  },
  mp3: {
    format: "mp3",
    label: "MP3 Audio (MP3)",
    mimeType: "audio/mpeg",
    category: "audio",
    extension: ".mp3",
  },
  wav: {
    format: "wav",
    label: "Waveform Audio File Format (WAV)",
    mimeType: "audio/wav",
    category: "audio",
    extension: ".wav",
  },
  ogg: {
    format: "ogg",
    label: "Ogg Vorbis Audio (OGG)",
    mimeType: "audio/ogg",
    category: "audio",
    extension: ".ogg",
  },
  flac: {
    format: "flac",
    label: "Free Lossless Audio Codec (FLAC)",
    mimeType: "audio/flac",
    category: "audio",
    extension: ".flac",
  },
  m4a: {
    format: "m4a",
    label: "MPEG-4 Audio (M4A)",
    mimeType: "audio/mp4",
    category: "audio",
    extension: ".m4a",
  },
  aac: {
    format: "aac",
    label: "Advanced Audio Coding (AAC)",
    mimeType: "audio/aac",
    category: "audio",
    extension: ".aac",
  },
  json: {
    format: "json",
    label: "JavaScript Object Notation (JSON)",
    mimeType: "application/json",
    category: "data",
    extension: ".json",
  },
  csv: {
    format: "csv",
    label: "Comma-Separated Values (CSV)",
    mimeType: "text/csv",
    category: "data",
    extension: ".csv",
  },
  tsv: {
    format: "tsv",
    label: "Tab-Separated Values (TSV)",
    mimeType: "text/tab-separated-values",
    category: "data",
    extension: ".tsv",
  },
  yaml: {
    format: "yaml",
    label: "YAML Ain't Markup Language (YAML)",
    mimeType: "application/x-yaml",
    category: "data",
    extension: ".yaml",
  },
  xml: {
    format: "xml",
    label: "Extensible Markup Language (XML)",
    mimeType: "application/xml",
    category: "data",
    extension: ".xml",
  },
  docx: {
    format: "docx",
    label: "Microsoft Word OpenXML (DOCX)",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    category: "document",
    extension: ".docx",
  },
  doc: {
    format: "doc",
    label: "Microsoft Word 97-2003 (DOC)",
    mimeType: "application/msword",
    category: "document",
    extension: ".doc",
  },
  pptx: {
    format: "pptx",
    label: "Microsoft PowerPoint OpenXML (PPTX)",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    category: "document",
    extension: ".pptx",
  },
  ppt: {
    format: "ppt",
    label: "Microsoft PowerPoint 97-2003 (PPT)",
    mimeType: "application/vnd.ms-powerpoint",
    category: "document",
    extension: ".ppt",
  },
  xlsx: {
    format: "xlsx",
    label: "Microsoft Excel OpenXML (XLSX)",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    category: "document",
    extension: ".xlsx",
  },
  xls: {
    format: "xls",
    label: "Microsoft Excel 97-2003 (XLS)",
    mimeType: "application/vnd.ms-excel",
    category: "document",
    extension: ".xls",
  },
  odt: {
    format: "odt",
    label: "OpenDocument Text (ODT)",
    mimeType: "application/vnd.oasis.opendocument.text",
    category: "document",
    extension: ".odt",
  },
  rtf: {
    format: "rtf",
    label: "Rich Text Format (RTF)",
    mimeType: "application/rtf",
    category: "document",
    extension: ".rtf",
  },
  txt: {
    format: "txt",
    label: "Plain Text Document (TXT)",
    mimeType: "text/plain",
    category: "document",
    extension: ".txt",
  },
  md: {
    format: "md",
    label: "Markdown Document (MD)",
    mimeType: "text/markdown",
    category: "document",
    extension: ".md",
  },
  html: {
    format: "html",
    label: "HyperText Markup Language (HTML)",
    mimeType: "text/html",
    category: "document",
    extension: ".html",
  },
  pdf: {
    format: "pdf",
    label: "Portable Document Format (PDF)",
    mimeType: "application/pdf",
    category: "document",
    extension: ".pdf",
  },
};

const CATEGORY_LABELS: Record<FileCategory, string> = {
  image: "Gambar",
  document: "Dokumen",
  audio: "Audio",
  video: "Video",
  data: "Data & Teks",
};

interface CacheEntry {
  isAvailable: boolean;
  expiresAt: number;
}

export class CapabilityRegistry {
  private static instance: CapabilityRegistry | null = null;
  private adapters: Map<string, IConversionAdapter> = new Map();
  private availabilityCache: Map<string, CacheEntry> = new Map();
  private inFlightAvailability: Map<string, Promise<boolean>> = new Map();
  private cacheTtlMs: number = 10000;

  private constructor() {}

  public static getInstance(): CapabilityRegistry {
    if (!CapabilityRegistry.instance) {
      CapabilityRegistry.instance = new CapabilityRegistry();
    }
    return CapabilityRegistry.instance;
  }

  public static resetInstance(): void {
    if (CapabilityRegistry.instance) {
      CapabilityRegistry.instance.clearAdapters();
      CapabilityRegistry.instance = null;
    }
  }

  public setCacheTtlMs(ttlMs: number): void {
    this.cacheTtlMs = ttlMs;
  }

  public registerAdapter(adapter: IConversionAdapter): void {
    this.adapters.set(adapter.id, adapter);
    this.availabilityCache.delete(adapter.id);
    this.inFlightAvailability.delete(adapter.id);
  }

  public unregisterAdapter(adapterId: string): boolean {
    this.availabilityCache.delete(adapterId);
    this.inFlightAvailability.delete(adapterId);
    return this.adapters.delete(adapterId);
  }

  public clearAdapters(): void {
    this.adapters.clear();
    this.availabilityCache.clear();
    this.inFlightAvailability.clear();
  }

  public getAdapter(adapterId: string): IConversionAdapter | undefined {
    return this.adapters.get(adapterId);
  }

  public getAllAdapters(): IConversionAdapter[] {
    return Array.from(this.adapters.values());
  }

  public normalizeFormat(format: string): string {
    const cleaned = format
      .trim()
      .toLowerCase()
      .replace(/^\.+/, "")
      .replace(/\.+$/, "")
      .trim();
    if (cleaned === "jpeg") {
      return "jpg";
    }
    if (cleaned === "tif") {
      return "tiff";
    }
    if (cleaned === "yml") {
      return "yaml";
    }
    return cleaned;
  }

  public getFormatCapability(format: string): FormatCapability | null {
    const normalized = this.normalizeFormat(format);
    return KNOWN_FORMAT_CATALOG[normalized] || null;
  }

  public async checkAdapterAvailability(
    adapter: IConversionAdapter,
    forceFresh: boolean = false
  ): Promise<boolean> {
    const now = Date.now();
    const cached = this.availabilityCache.get(adapter.id);

    if (!forceFresh && cached && cached.expiresAt > now) {
      return cached.isAvailable;
    }

    if (!forceFresh) {
      const inFlight = this.inFlightAvailability.get(adapter.id);
      if (inFlight) {
        return inFlight;
      }
    }

    const checkPromise = (async (): Promise<boolean> => {
      try {
        const isAvailable = await adapter.isAvailable();
        this.availabilityCache.set(adapter.id, {
          isAvailable,
          expiresAt: Date.now() + this.cacheTtlMs,
        });
        return isAvailable;
      } catch {
        this.availabilityCache.set(adapter.id, {
          isAvailable: false,
          expiresAt: Date.now() + this.cacheTtlMs,
        });
        return false;
      }
    })();

    this.inFlightAvailability.set(adapter.id, checkPromise);

    checkPromise.finally(() => {
      if (this.inFlightAvailability.get(adapter.id) === checkPromise) {
        this.inFlightAvailability.delete(adapter.id);
      }
    });

    return checkPromise;
  }

  public async getTargetsForSource(
    sourceFormat: string
  ): Promise<{
    sourceCapability: FormatCapability | null;
    targets: ConversionTarget[];
    unavailableAdapters: UnavailableAdapterNotice[];
  }> {
    const normalizedSource = this.normalizeFormat(sourceFormat);
    const sourceCapability = this.getFormatCapability(normalizedSource);

    const targetsMap = new Map<string, ConversionTarget>();
    const unavailableAdapters: UnavailableAdapterNotice[] = [];

    for (const adapter of this.adapters.values()) {
      const supportedSources = adapter
        .getSupportedSources()
        .map((fmt) => this.normalizeFormat(fmt));

      if (!supportedSources.includes(normalizedSource)) {
        continue;
      }

      const isAvailable = await this.checkAdapterAvailability(adapter);

      if (!isAvailable) {
        unavailableAdapters.push({
          adapterId: adapter.id,
          name: adapter.name,
          category: adapter.category,
          setupInstructions: adapter.getSetupInstructions(),
        });
        continue;
      }

      try {
        const adapterTargets = await adapter.getSupportedTargets(normalizedSource);
        for (const target of adapterTargets) {
          const normTarget = this.normalizeFormat(target.targetFormat);

          if (!target.isAvailable) {
            continue;
          }

          if (normTarget === normalizedSource && !target.optionsSchema) {
            continue;
          }

          if (!targetsMap.has(normTarget)) {
            targetsMap.set(normTarget, {
              ...target,
              targetFormat: normTarget,
            });
          }
        }
      } catch {
        unavailableAdapters.push({
          adapterId: adapter.id,
          name: adapter.name,
          category: adapter.category,
          setupInstructions: adapter.getSetupInstructions(),
        });
      }
    }

    return {
      sourceCapability,
      targets: Array.from(targetsMap.values()),
      unavailableAdapters,
    };
  }

  public async findAdapterForPair(
    sourceFormat: string,
    targetFormat: string
  ): Promise<IConversionAdapter | null> {
    const normSource = this.normalizeFormat(sourceFormat);
    const normTarget = this.normalizeFormat(targetFormat);

    for (const adapter of this.adapters.values()) {
      const sources = adapter
        .getSupportedSources()
        .map((fmt) => this.normalizeFormat(fmt));

      if (!sources.includes(normSource)) {
        continue;
      }

      const isAvailable = await this.checkAdapterAvailability(adapter);
      if (!isAvailable) {
        continue;
      }

      const targets = await adapter.getSupportedTargets(normSource);
      const supportsTarget = targets.some(
        (t) => this.normalizeFormat(t.targetFormat) === normTarget && t.isAvailable
      );

      if (supportsTarget) {
        return adapter;
      }
    }

    return null;
  }

  public async getAdapterSummaries(): Promise<AdapterStatus[]> {
    const summaries: AdapterStatus[] = [];

    for (const adapter of this.adapters.values()) {
      const isAvailable = await this.checkAdapterAvailability(adapter);
      summaries.push({
        id: adapter.id,
        name: adapter.name,
        category: adapter.category,
        isAvailable,
        supportedSourcesCount: adapter.getSupportedSources().length,
        setupInstructions: isAvailable ? undefined : adapter.getSetupInstructions(),
      });
    }

    return summaries;
  }

  public async getCatalogResponse(): Promise<CapabilitiesCatalogResponse> {
    const adapters = await this.getAdapterSummaries();
    const totalAdapters = adapters.length;
    const totalActiveAdapters = adapters.filter((a) => a.isAvailable).length;

    const categories: Record<FileCategory, CategorySummary> = {
      image: { label: CATEGORY_LABELS.image, active: false, sources: [] },
      document: { label: CATEGORY_LABELS.document, active: false, sources: [] },
      audio: { label: CATEGORY_LABELS.audio, active: false, sources: [] },
      video: { label: CATEGORY_LABELS.video, active: false, sources: [] },
      data: { label: CATEGORY_LABELS.data, active: false, sources: [] },
    };

    const sourcesSet = new Set<string>();

    for (const adapter of this.adapters.values()) {
      const isAvailable = await this.checkAdapterAvailability(adapter);
      const cat = adapter.category;

      if (isAvailable) {
        categories[cat].active = true;
      } else if (!categories[cat].setupInstructions) {
        categories[cat].setupInstructions = adapter.getSetupInstructions();
      }

      for (const src of adapter.getSupportedSources()) {
        const cap = this.getFormatCapability(src);
        const norm = this.normalizeFormat(src);
        const bucketCat = cap ? cap.category : cat;
        if (isAvailable) {
          categories[bucketCat].active = true;
        }
        if (!categories[bucketCat].sources.includes(norm)) {
          categories[bucketCat].sources.push(norm);
        }
        sourcesSet.add(norm);
      }
    }

    const supportedSources: FormatCapability[] = [];
    for (const src of sourcesSet) {
      const cap = this.getFormatCapability(src);
      if (cap) {
        supportedSources.push(cap);
      }
    }

    return {
      status: "ok",
      categories,
      supportedSources,
      adapters,
      totalActiveAdapters,
      totalAdapters,
    };
  }

  public async executeConversion(
    inputPath: string,
    outputPath: string,
    sourceFormat: string,
    targetFormat: string,
    options?: Record<string, unknown>
  ): Promise<ConversionResult> {
    const adapter = await this.findAdapterForPair(sourceFormat, targetFormat);

    if (!adapter) {
      throw new Error(
        `Tidak ada adapter aktif yang mendukung konversi dari ${sourceFormat} ke ${targetFormat}.`
      );
    }

    return adapter.convert(
      inputPath,
      outputPath,
      this.normalizeFormat(sourceFormat),
      this.normalizeFormat(targetFormat),
      options
    );
  }
}

export function ensureDefaultAdapters(registry: CapabilityRegistry): void {
  if (registry.getAllAdapters().length === 0) {
    registry.registerAdapter(new SharpImageAdapter());
    registry.registerAdapter(new PureDataAdapter());
    registry.registerAdapter(new UniversalOfficeDocumentAdapter());
    registry.registerAdapter(new LibreOfficeDocumentAdapter());
    registry.registerAdapter(new FFmpegMediaAdapter());
  }
}

export const capabilityRegistry: CapabilityRegistry = new Proxy({} as CapabilityRegistry, {
  get(_target, prop, receiver) {
    const instance = CapabilityRegistry.getInstance();
    ensureDefaultAdapters(instance);
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});
