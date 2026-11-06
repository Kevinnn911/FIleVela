// File: src/lib/adapters/sharp-image.ts

import fs from "fs";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import {
  encodeRgbaToBmp,
  loadSharpCompatibleImage,
} from "@/lib/image/bmp-ico-codec";
import {
  ConversionOptionDefinition,
  ConversionResult,
  ConversionTarget,
  FileCategory,
  IConversionAdapter,
} from "./types";

const TARGET_FORMAT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  tiff: "image/tiff",
  gif: "image/gif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  pdf: "application/pdf",
};

const TARGET_FORMAT_LABELS: Record<string, string> = {
  png: "PNG (Portable Network Graphics)",
  jpg: "JPEG (Joint Photographic Experts Group)",
  jpeg: "JPEG (Joint Photographic Experts Group)",
  webp: "WebP (Google Web Picture)",
  avif: "AV1 Image File Format (AVIF)",
  tiff: "TIFF (Tagged Image File Format)",
  gif: "GIF (Graphics Interchange Format)",
  bmp: "BMP (Windows Bitmap 24/32-bit)",
  ico: "ICO (Windows Multi-Size Favicon)",
  pdf: "PDF (Portable Document Format)",
};

const COMMON_IMAGE_OPTIONS: Record<string, ConversionOptionDefinition> = {
  quality: {
    name: "quality",
    label: "Kualitas Kompresi (1-100)",
    type: "number",
    default: 85,
    min: 1,
    max: 100,
    step: 1,
    description:
      "Kualitas gambar target: angka lebih tinggi menghasilkan gambar lebih jernih dengan ukuran lebih besar.",
  },
};

async function generateIcoBuffer(inputPath: string): Promise<Buffer> {
  const sizes = [16, 32, 48, 256];
  const pngBuffers: Buffer[] = [];
  const baseBuffer = await fs.promises.readFile(inputPath);

  for (const size of sizes) {
    const baseImg = await loadSharpCompatibleImage(baseBuffer);
    const png = await baseImg
      .rotate()
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    pngBuffers.push(png);
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);

  let offset = 6 + sizes.length * 16;
  const dirEntries: Buffer[] = [];

  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i]!;
    const pngData = pngBuffers[i]!;
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(pngData.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += pngData.length;
  }

  return Buffer.concat([header, ...dirEntries, ...pngBuffers]);
}

async function generateImagePdfBuffer(
  inputPath: string,
  qualityNum: number
): Promise<Buffer> {
  const srcBuffer = await fs.promises.readFile(inputPath);
  const img = await loadSharpCompatibleImage(srcBuffer);
  const rotated = img.rotate();
  const meta = await rotated.metadata();

  const hasAlpha = Boolean(meta.hasAlpha);
  const pdfDoc = await PDFDocument.create();

  let embeddedImage;
  if (hasAlpha) {
    const pngBytes = await (await loadSharpCompatibleImage(srcBuffer))
      .rotate()
      .png({ compressionLevel: 9 })
      .toBuffer();
    embeddedImage = await pdfDoc.embedPng(pngBytes);
  } else {
    const jpgBytes = await (await loadSharpCompatibleImage(srcBuffer))
      .rotate()
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: qualityNum, mozjpeg: true })
      .toBuffer();
    embeddedImage = await pdfDoc.embedJpg(jpgBytes);
  }

  const imgW = embeddedImage.width;
  const imgH = embeddedImage.height;

  const isLandscape = imgW > imgH * 1.15;
  const pageW = isLandscape ? 841.89 : 595.28;
  const pageH = isLandscape ? 595.28 : 841.89;
  const margin = 36;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2;

  const scale = Math.min(availW / imgW, availH / imgH, 1);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const drawX = (pageW - drawW) / 2;
  const drawY = (pageH - drawH) / 2;

  const page = pdfDoc.addPage([pageW, pageH]);
  page.drawImage(embeddedImage, {
    x: drawX,
    y: drawY,
    width: drawW,
    height: drawH,
  });

  const saved = await pdfDoc.save({ useObjectStreams: true });
  return Buffer.from(saved);
}

export class SharpImageAdapter implements IConversionAdapter {
  public readonly id: string = "sharp-image";
  public readonly name: string = "Sharp Image Processing Engine";
  public readonly category: FileCategory = "image";

  private supportedSources: string[] = [
    "png",
    "jpg",
    "jpeg",
    "webp",
    "avif",
    "tiff",
    "gif",
    "bmp",
    "svg",
    "ico",
  ];

  private supportedTargets: string[] = [
    "png",
    "jpg",
    "webp",
    "avif",
    "tiff",
    "gif",
    "bmp",
    "ico",
    "pdf",
  ];

  public async isAvailable(): Promise<boolean> {
    try {
      sharp.cache(false);
      return typeof sharp === "function";
    } catch {
      return false;
    }
  }

  public getSetupInstructions(): string {
    return "Engine Sharp terpasang melalui modul npm runtime Node.js.";
  }

  public getSupportedSources(): string[] {
    return [...this.supportedSources];
  }

  public async getSupportedTargets(sourceFormat: string): Promise<ConversionTarget[]> {
    const cleanSource = sourceFormat.toLowerCase().replace(/^\.+/, "");
    const normalizedSource = cleanSource === "tif" ? "tiff" : cleanSource;
    const targets: ConversionTarget[] = [];

    for (const target of this.supportedTargets) {
      if (
        target === normalizedSource ||
        (target === "jpg" && normalizedSource === "jpeg") ||
        (target === "jpeg" && normalizedSource === "jpg")
      ) {
        continue;
      }

      targets.push({
        targetFormat: target,
        label: TARGET_FORMAT_LABELS[target] || target.toUpperCase(),
        mimeType: TARGET_FORMAT_MIME[target] || "application/octet-stream",
        adapterId: this.id,
        isAvailable: true,
        optionsSchema:
          target !== "ico" && target !== "bmp" ? COMMON_IMAGE_OPTIONS : undefined,
      });
    }

    return targets;
  }

  public async convert(
    inputPath: string,
    outputPath: string,
    sourceFormat: string,
    targetFormat: string,
    options?: Record<string, unknown>
  ): Promise<ConversionResult> {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`File sumber tidak ditemukan pada jalur: ${inputPath}`);
    }

    const startTime = Date.now();
    sharp.cache(false);

    const cleanSource = sourceFormat.toLowerCase().replace(/^\.+/, "");
    const cleanTarget = targetFormat.toLowerCase().replace(/^\.+/, "");
    const normalizedTarget = cleanTarget === "tif" ? "tiff" : cleanTarget;

    const qualityNum =
      typeof options?.quality === "number"
        ? Math.max(1, Math.min(100, options.quality))
        : 85;

    if (normalizedTarget === "ico") {
      const icoBuf = await generateIcoBuffer(inputPath);
      await fs.promises.writeFile(outputPath, icoBuf);

      const stat = fs.statSync(outputPath);
      const durationMs = Date.now() - startTime;

      return {
        outputBytes: stat.size,
        mimeType: "image/x-icon",
        outputPath,
        durationMs,
      };
    }

    if (normalizedTarget === "pdf") {
      const pdfBuf = await generateImagePdfBuffer(inputPath, qualityNum);
      await fs.promises.writeFile(outputPath, pdfBuf);

      const stat = fs.statSync(outputPath);
      const durationMs = Date.now() - startTime;

      return {
        outputBytes: stat.size,
        mimeType: "application/pdf",
        outputPath,
        durationMs,
      };
    }

    const shouldPreserveAnimation =
      (cleanSource === "gif" || cleanSource === "webp") &&
      (normalizedTarget === "webp" || normalizedTarget === "gif");

    const safeDensity =
      typeof options?.density === "number" && Number.isFinite(options.density)
        ? Math.max(72, Math.min(600, Math.round(options.density)))
        : undefined;

    let transformer = await loadSharpCompatibleImage(inputPath, {
      animated: shouldPreserveAnimation,
      density: safeDensity,
    });

    if (!shouldPreserveAnimation) {
      transformer = transformer.rotate();
    }

    const safeWidth =
      typeof options?.width === "number" && Number.isFinite(options.width)
        ? Math.max(1, Math.min(8192, Math.round(options.width)))
        : undefined;
    const safeHeight =
      typeof options?.height === "number" && Number.isFinite(options.height)
        ? Math.max(1, Math.min(8192, Math.round(options.height)))
        : undefined;

    if (safeWidth !== undefined || safeHeight !== undefined) {
      transformer = transformer.resize({
        width: safeWidth,
        height: safeHeight,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    if (normalizedTarget === "bmp") {
      const { data, info } = await transformer
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const bmpBuf = encodeRgbaToBmp(data, info.width, info.height, true);
      await fs.promises.writeFile(outputPath, bmpBuf);

      const stat = fs.statSync(outputPath);
      const durationMs = Date.now() - startTime;

      return {
        outputBytes: stat.size,
        mimeType: "image/bmp",
        outputPath,
        durationMs,
      };
    }

    switch (normalizedTarget) {
      case "png":
        transformer = transformer.png({ compressionLevel: 9 });
        break;
      case "jpg":
      case "jpeg":
        transformer = transformer
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: qualityNum, mozjpeg: true });
        break;
      case "webp":
        transformer = transformer.webp({ quality: qualityNum });
        break;
      case "avif":
        transformer = transformer.avif({ quality: qualityNum });
        break;
      case "tiff":
        transformer = transformer.tiff({ quality: qualityNum });
        break;
      case "gif":
        transformer = transformer.gif();
        break;
      default:
        throw new Error(`Format target ${targetFormat} tidak didukung oleh ${this.name}`);
    }

    await transformer.toFile(outputPath);

    if (!fs.existsSync(outputPath)) {
      throw new Error("Gagal menghasilkan file keluaran konversi");
    }

    const stat = fs.statSync(outputPath);
    if (stat.size === 0) {
      throw new Error("File hasil konversi memiliki ukuran 0 byte");
    }

    const durationMs = Date.now() - startTime;
    const mimeType = TARGET_FORMAT_MIME[normalizedTarget] || "application/octet-stream";

    return {
      outputBytes: stat.size,
      mimeType,
      outputPath,
      durationMs,
    };
  }
}
