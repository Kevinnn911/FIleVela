// File: src/lib/adapters/types.ts

export type FileCategory = "image" | "document" | "audio" | "video" | "data";

export type OptionType = "number" | "boolean" | "string" | "select";

export interface OptionChoice {
  value: string;
  label: string;
}

export interface ConversionOptionDefinition {
  name: string;
  label: string;
  type: OptionType;
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  choices?: OptionChoice[];
  description?: string;
}

export interface FormatCapability {
  format: string;
  label: string;
  mimeType: string;
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
  optionsSchema?: Record<string, ConversionOptionDefinition>;
}

export interface ConversionResult {
  outputBytes: number;
  mimeType: string;
  outputPath: string;
  durationMs?: number;
}

export interface AdapterStatus {
  id: string;
  name: string;
  category: FileCategory;
  isAvailable: boolean;
  supportedSourcesCount: number;
  setupInstructions?: string;
}

export interface UnavailableAdapterNotice {
  adapterId: string;
  name: string;
  category: FileCategory;
  setupInstructions: string;
  missingEngine?: string;
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
    options?: Record<string, unknown>
  ): Promise<ConversionResult>;
}

export interface CapabilitiesSourceResponse {
  source: {
    format: string;
    mimeType: string;
    category: FileCategory;
    label?: string;
  };
  targets: ConversionTarget[];
  unavailableAdapters: UnavailableAdapterNotice[];
}

export interface CategorySummary {
  label: string;
  active: boolean;
  requires?: string;
  setupInstructions?: string;
  sources: string[];
}

export interface CapabilitiesCatalogResponse {
  status: "ok";
  categories: Record<FileCategory, CategorySummary>;
  supportedSources: FormatCapability[];
  adapters: AdapterStatus[];
  totalActiveAdapters: number;
  totalAdapters: number;
}

export interface CapabilitiesErrorResponse {
  error: string;
  code: "INVALID_SOURCE_FORMAT" | "SOURCE_NOT_SUPPORTED" | "SERVER_ERROR";
  message: string;
  sourceFormat?: string;
  supportedFormats?: string[];
  unavailableAdapters?: UnavailableAdapterNotice[];
}
