// File: src/lib/bg-removal/sharp-local-provider.ts

import fs from "fs";
import sharp from "sharp";
import { loadSharpCompatibleImage } from "../image/bmp-ico-codec";
import {
  BgMode,
  BgRemovalOptions,
  BgRemovalResult,
  IBackgroundRemovalProvider,
} from "./types";

function parseHexColor(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0]! + clean[0]!, 16);
    const g = parseInt(clean[1]! + clean[1]!, 16);
    const b = parseInt(clean[2]! + clean[2]!, 16);
    return [
      Number.isNaN(r) ? 255 : r,
      Number.isNaN(g) ? 255 : g,
      Number.isNaN(b) ? 255 : b,
    ];
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return [
      Number.isNaN(r) ? 255 : r,
      Number.isNaN(g) ? 255 : g,
      Number.isNaN(b) ? 255 : b,
    ];
  }
  return [255, 255, 255];
}

const SRGB_TO_LINEAR_LUT = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    lut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return lut;
})();

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lr = SRGB_TO_LINEAR_LUT[r] ?? 0;
  const lg = SRGB_TO_LINEAR_LUT[g] ?? 0;
  const lb = SRGB_TO_LINEAR_LUT[b] ?? 0;

  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;

  const f = (t: number): number =>
    t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;

  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labDistance(
  l1: number,
  a1: number,
  b1: number,
  l2: number,
  a2: number,
  b2: number
): number {
  const dl = l1 - l2;
  const da = a1 - a2;
  const db = b1 - b2;
  return Math.sqrt(dl * dl + da * da + db * db);
}

export class SharpLocalBgRemovalProvider implements IBackgroundRemovalProvider {
  public readonly id: string = "sharp-local-alpha";
  public readonly name: string =
    "Sharp CIE-Lab Edge-Aware Flood Matting Engine";

  public async isAvailable(): Promise<boolean> {
    try {
      sharp.cache(false);
      return typeof sharp === "function";
    } catch {
      return false;
    }
  }

  public getSetupInstructions(): string {
    return "Engine pemroses gambar Sharp CIE-Lab Matting aktif secara native.";
  }

  public async removeBackground(
    inputPath: string,
    outputPath: string,
    options?: BgRemovalOptions
  ): Promise<BgRemovalResult> {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`File sumber tidak ditemukan pada: ${inputPath}`);
    }

    const startTime = Date.now();
    sharp.cache(false);

    const inputBuffer = await fs.promises.readFile(inputPath);
    const sharpImg = await loadSharpCompatibleImage(inputBuffer);

    const { data, info } = await sharpImg
      .rotate()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const channels = info.channels;

    if (channels !== 4 || width <= 0 || height <= 0) {
      throw new Error("Gagal mengekstrak 4-channel RGBA dari gambar.");
    }

    const totalPixels = width * height;

    // Inspect perimeter alpha to preserve already-cutout transparent PNGs
    let perimeterTotal = 0;
    let perimeterTransparent = 0;
    for (let x = 0; x < width; x++) {
      perimeterTotal += 2;
      if ((data[x * 4 + 3] ?? 255) < 24) perimeterTransparent++;
      if ((data[((height - 1) * width + x) * 4 + 3] ?? 255) < 24) {
        perimeterTransparent++;
      }
    }
    for (let y = 1; y < height - 1; y++) {
      perimeterTotal += 2;
      if ((data[y * width * 4 + 3] ?? 255) < 24) perimeterTransparent++;
      if ((data[(y * width + (width - 1)) * 4 + 3] ?? 255) < 24) {
        perimeterTransparent++;
      }
    }

    const alreadyCutout =
      !options?.backgroundColor &&
      perimeterTotal > 0 &&
      perimeterTransparent / perimeterTotal >= 0.55;

    let transparentCount = 0;

    if (alreadyCutout) {
      for (let i = 3; i < data.length; i += 4) {
        if ((data[i] ?? 255) < 250) {
          transparentCount++;
        }
      }
    } else {
      // Precompute CIE-Lab coordinates for all pixels
      const labL = new Float32Array(totalPixels);
      const labA = new Float32Array(totalPixels);
      const labB = new Float32Array(totalPixels);

      for (let p = 0; p < totalPixels; p++) {
        const off = p * 4;
        const [l, a, b] = rgbToLab(
          data[off] ?? 0,
          data[off + 1] ?? 0,
          data[off + 2] ?? 0
        );
        labL[p] = l;
        labA[p] = a;
        labB[p] = b;
      }

      // Compute Sobel gradient magnitude on Lab L+chroma to stop flood-fill at edges
      const sobel = new Float32Array(totalPixels);
      if (width >= 3 && height >= 3) {
        for (let y = 1; y < height - 1; y++) {
          const rowOff = y * width;
          const prevOff = (y - 1) * width;
          const nextOff = (y + 1) * width;
          for (let x = 1; x < width - 1; x++) {
            const gxL =
              -(labL[prevOff + x - 1] ?? 0) +
              (labL[prevOff + x + 1] ?? 0) -
              2 * (labL[rowOff + x - 1] ?? 0) +
              2 * (labL[rowOff + x + 1] ?? 0) -
              (labL[nextOff + x - 1] ?? 0) +
              (labL[nextOff + x + 1] ?? 0);
            const gyL =
              -(labL[prevOff + x - 1] ?? 0) -
              2 * (labL[prevOff + x] ?? 0) -
              (labL[prevOff + x + 1] ?? 0) +
              (labL[nextOff + x - 1] ?? 0) +
              2 * (labL[nextOff + x] ?? 0) +
              (labL[nextOff + x + 1] ?? 0);

            const gxC =
              -(labA[rowOff + x - 1] ?? 0) +
              (labA[rowOff + x + 1] ?? 0) +
              (-(labB[rowOff + x - 1] ?? 0) + (labB[rowOff + x + 1] ?? 0));
            const gyC =
              -(labA[prevOff + x] ?? 0) +
              (labA[nextOff + x] ?? 0) +
              (-(labB[prevOff + x] ?? 0) + (labB[nextOff + x] ?? 0));

            const magL = Math.sqrt(gxL * gxL + gyL * gyL) * 0.25;
            const magC = Math.sqrt(gxC * gxC + gyC * gyC) * 0.35;
            sobel[rowOff + x] = Math.max(magL, magC);
          }
        }
      }

      // Determine reference background color (RGB & CIE-Lab)
      let bgR = 255;
      let bgG = 255;
      let bgB = 255;

      if (options?.backgroundColor) {
        const [r, g, b] = parseHexColor(options.backgroundColor);
        bgR = r;
        bgG = g;
        bgB = b;
      } else {
        interface ClusterBin {
          count: number;
          sumR: number;
          sumG: number;
          sumB: number;
        }
        const bins = new Map<string, ClusterBin>();

        const addBorderSample = (x: number, y: number) => {
          const p = y * width + x;
          const off = p * 4;
          const alpha = data[off + 3] ?? 255;
          if (alpha < 64) return;
          const r = data[off] ?? 0;
          const g = data[off + 1] ?? 0;
          const b = data[off + 2] ?? 0;
          const ql = Math.round((labL[p] ?? 0) / 8);
          const qa = Math.round((labA[p] ?? 0) / 8);
          const qb = Math.round((labB[p] ?? 0) / 8);
          const key = `${ql}_${qa}_${qb}`;
          const existing = bins.get(key);
          if (existing) {
            existing.count++;
            existing.sumR += r;
            existing.sumG += g;
            existing.sumB += b;
          } else {
            bins.set(key, { count: 1, sumR: r, sumG: g, sumB: b });
          }
        };

        const stepX = Math.max(1, Math.floor(width / 48));
        const stepY = Math.max(1, Math.floor(height / 48));
        const bottomLeftLimit = Math.floor(width * 0.18);
        const bottomRightStart = Math.ceil(width * 0.82);

        for (let x = 0; x < width; x += stepX) {
          addBorderSample(x, 0);
          if (x <= bottomLeftLimit || x >= bottomRightStart) {
            addBorderSample(x, height - 1);
          }
        }
        for (let y = 0; y < height; y += stepY) {
          addBorderSample(0, y);
          addBorderSample(width - 1, y);
        }

        let bestBin: ClusterBin | null = null;
        for (const bin of Array.from(bins.values())) {
          if (!bestBin || bin.count > bestBin.count) {
            bestBin = bin;
          }
        }

        if (bestBin && bestBin.count > 0) {
          bgR = Math.round(bestBin.sumR / bestBin.count);
          bgG = Math.round(bestBin.sumG / bestBin.count);
          bgB = Math.round(bestBin.sumB / bestBin.count);
        }
      }

      const [bgL, bgA, bgLabB] = rgbToLab(bgR, bgG, bgB);
      const rawTolerance = Math.max(5, Math.min(100, options?.tolerance ?? 38));
      const maxGlobalDeltaE = rawTolerance * 0.72;
      const maxStepDeltaE = Math.max(7.5, rawTolerance * 0.28);
      const edgeBarrier = Math.max(14, rawTolerance * 0.62);
      const featherLab = Math.max(4, (options?.feather ?? 16) * 0.45);
      const antiHalo = options?.antiHalo ?? true;

      // 8-connected Border-Seeded Flood-Fill
      const bgMask = new Uint8Array(totalPixels);
      const queue = new Int32Array(totalPixels);
      let qHead = 0;
      let qTail = 0;

      const trySeed = (x: number, y: number) => {
        const p = y * width + x;
        if (bgMask[p] === 1) return;
        const alpha = data[p * 4 + 3] ?? 255;
        if (alpha < 16) {
          bgMask[p] = 1;
          queue[qTail++] = p;
          return;
        }
        const dE = labDistance(
          labL[p] ?? 0,
          labA[p] ?? 0,
          labB[p] ?? 0,
          bgL,
          bgA,
          bgLabB
        );
        if (dE <= maxGlobalDeltaE * 1.15) {
          bgMask[p] = 1;
          queue[qTail++] = p;
        }
      };

      // Seed top, left, right borders + outer 18% of bottom border (protects bottom-anchored white shirts)
      const bottomCornerLeft = Math.floor(width * 0.18);
      const bottomCornerRight = Math.ceil(width * 0.82);

      for (let x = 0; x < width; x++) {
        trySeed(x, 0);
        if (x <= bottomCornerLeft || x >= bottomCornerRight) {
          trySeed(x, height - 1);
        }
      }
      for (let y = 1; y < height - 1; y++) {
        trySeed(0, y);
        trySeed(width - 1, y);
      }

      const neighborOffsets: Array<[number, number]> = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ];

      while (qHead < qTail) {
        const curr = queue[qHead++]!;
        const cx = curr % width;
        const cy = (curr - cx) / width;
        const cL = labL[curr] ?? 0;
        const cA = labA[curr] ?? 0;
        const cB = labB[curr] ?? 0;

        for (let n = 0; n < 8; n++) {
          const [dx, dy] = neighborOffsets[n]!;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

          const np = ny * width + nx;
          if (bgMask[np] === 1) continue;

          const nAlpha = data[np * 4 + 3] ?? 255;
          if (nAlpha < 16) {
            bgMask[np] = 1;
            queue[qTail++] = np;
            continue;
          }

          if ((sobel[np] ?? 0) >= edgeBarrier) {
            continue;
          }

          const nL = labL[np] ?? 0;
          const nA = labA[np] ?? 0;
          const nB = labB[np] ?? 0;

          const dGlobal = labDistance(nL, nA, nB, bgL, bgA, bgLabB);
          if (dGlobal > maxGlobalDeltaE) continue;

          const dStep = labDistance(nL, nA, nB, cL, cA, cB);
          if (dStep <= maxStepDeltaE) {
            bgMask[np] = 1;
            queue[qTail++] = np;
          }
        }
      }

      // Apply background mask + 1-2px boundary alpha feathering & foreground color despill
      for (let p = 0; p < totalPixels; p++) {
        const off = p * 4;
        if (bgMask[p] === 1) {
          data[off + 3] = 0;
          transparentCount++;
          continue;
        }

        const x = p % width;
        const y = (p - x) / width;
        let bgNeighborCount = 0;

        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            if (bgMask[ny * width + nx] === 1) {
              bgNeighborCount++;
            }
          }
        }

        if (bgNeighborCount > 0) {
          const dGlobal = labDistance(
            labL[p] ?? 0,
            labA[p] ?? 0,
            labB[p] ?? 0,
            bgL,
            bgA,
            bgLabB
          );

          if (dGlobal < maxGlobalDeltaE + featherLab) {
            const rawFactor =
              (dGlobal - maxGlobalDeltaE * 0.45) /
              Math.max(1, maxGlobalDeltaE * 0.55 + featherLab);
            const coveragePenalty = bgNeighborCount >= 5 ? 0.72 : 0.88;
            const factor = Math.max(
              0.12,
              Math.min(1, rawFactor * coveragePenalty)
            );
            const origAlpha = data[off + 3] ?? 255;
            const newAlpha = Math.round(origAlpha * factor);
            data[off + 3] = newAlpha;
            if (newAlpha < 255) {
              transparentCount++;
            }

            if (antiHalo && factor < 0.92 && factor > 0.08) {
              const r = data[off] ?? 0;
              const g = data[off + 1] ?? 0;
              const b = data[off + 2] ?? 0;
              const inv = 1 - factor;
              data[off] = Math.max(
                0,
                Math.min(255, Math.round((r - bgR * inv) / factor))
              );
              data[off + 1] = Math.max(
                0,
                Math.min(255, Math.round((g - bgG * inv) / factor))
              );
              data[off + 2] = Math.max(
                0,
                Math.min(255, Math.round((b - bgB * inv) / factor))
              );
            }
          }
        }
      }
    }

    const mode: BgMode = options?.mode || "transparent";

    if (mode === "solid" && options?.replacementColor) {
      const [targetR, targetG, targetB] = parseHexColor(options.replacementColor);
      for (let i = 0; i < data.length; i += 4) {
        const a = (data[i + 3] ?? 255) / 255;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;

        data[i] = Math.round(r * a + targetR * (1 - a));
        data[i + 1] = Math.round(g * a + targetG * (1 - a));
        data[i + 2] = Math.round(b * a + targetB * (1 - a));
        data[i + 3] = 255;
      }
    } else if (mode === "gradient" && options?.gradientStart && options?.gradientEnd) {
      const [startR, startG, startB] = parseHexColor(options.gradientStart);
      const [endR, endG, endB] = parseHexColor(options.gradientEnd);

      for (let y = 0; y < height; y++) {
        const t = y / Math.max(1, height - 1);
        const gradR = Math.round(startR * (1 - t) + endR * t);
        const gradG = Math.round(startG * (1 - t) + endG * t);
        const gradB = Math.round(startB * (1 - t) + endB * t);

        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const a = (data[idx + 3] ?? 255) / 255;
          const r = data[idx] ?? 0;
          const g = data[idx + 1] ?? 0;
          const b = data[idx + 2] ?? 0;

          data[idx] = Math.round(r * a + gradR * (1 - a));
          data[idx + 1] = Math.round(g * a + gradG * (1 - a));
          data[idx + 2] = Math.round(b * a + gradB * (1 - a));
          data[idx + 3] = 255;
        }
      }
    }

    await sharp(data, {
      raw: {
        width,
        height,
        channels: 4,
      },
    })
      .png({ compressionLevel: 9 })
      .toFile(outputPath);

    if (!fs.existsSync(outputPath)) {
      throw new Error("Gagal membuat file hasil penghapusan background.");
    }

    const stat = fs.statSync(outputPath);
    const durationMs = Date.now() - startTime;

    return {
      outputPath,
      outputBytes: stat.size,
      mimeType: "image/png",
      transparentPixelCount: mode === "transparent" ? transparentCount : 0,
      durationMs,
      provider: this.name,
      mode,
    };
  }
}
