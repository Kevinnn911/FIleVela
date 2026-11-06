// File: src/lib/bg-removal/types.ts

export type BgMode = "transparent" | "solid" | "gradient";

export interface BgRemovalOptions {
  mode?: BgMode;
  tolerance?: number;
  feather?: number;
  backgroundColor?: string;
  replacementColor?: string;
  gradientStart?: string;
  gradientEnd?: string;
  antiHalo?: boolean;
  targetFormat?: "png";
}

export interface BgRemovalResult {
  outputPath: string;
  outputBytes: number;
  mimeType: string;
  transparentPixelCount: number;
  durationMs: number;
  provider: string;
  mode: BgMode;
}

export interface IBackgroundRemovalProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): Promise<boolean>;
  getSetupInstructions(): string;
  removeBackground(
    inputPath: string,
    outputPath: string,
    options?: BgRemovalOptions
  ): Promise<BgRemovalResult>;
}
