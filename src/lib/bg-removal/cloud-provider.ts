// File: src/lib/bg-removal/cloud-provider.ts

import {
  BgRemovalOptions,
  BgRemovalResult,
  IBackgroundRemovalProvider,
} from "./types";

export class CloudAiBgRemovalProvider implements IBackgroundRemovalProvider {
  public readonly id: string = "cloud-ai";
  public readonly name: string = "Cloud AI Neural Segmentation Service";

  public async isAvailable(): Promise<boolean> {
    const key = process.env.BG_REMOVAL_API_KEY;
    return typeof key === "string" && key.trim().length > 0;
  }

  public getSetupInstructions(): string {
    return "Layanan Cloud AI background removal belum dikonfigurasi. Atur variabel lingkungan BG_REMOVAL_API_KEY di server untuk menggunakan model segmentasi AI cloud.";
  }

  public async removeBackground(
    _inputPath: string,
    _outputPath: string,
    _options?: BgRemovalOptions
  ): Promise<BgRemovalResult> {
    const isAvail = await this.isAvailable();
    if (!isAvail) {
      throw new Error(this.getSetupInstructions());
    }

    throw new Error("Layanan Cloud AI saat ini belum terhubung ke gateway eksternal.");
  }
}

