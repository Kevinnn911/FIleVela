// File: src/lib/compression/file-compressor.ts

import { execFile } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import sharp from "sharp";
import { ZipReader } from "../document/zip-reader";
import { ZipWriter } from "../document/zip-writer";
import { encodeRgbaToBmp, loadSharpCompatibleImage } from "../image/bmp-ico-codec";

const execFileAsync = promisify(execFile);

export type CompressionLevel = "low" | "recommended" | "extreme";

export interface CompressionResult {
  originalSizeBytes: number;
  compressedSizeBytes: number;
  savedBytes: number;
  savedPercentage: number;
  mimeType: string;
  compressedBuffer: Buffer;
  durationMs: number;
}

const IMAGE_COMPRESSION_FORMATS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "avif",
  "tiff",
  "gif",
  "bmp",
  "svg",
]);

const PACKAGE_COMPRESSION_FORMATS = new Set([
  "docx",
  "pptx",
  "xlsx",
  "odt",
  "zip",
]);

const MEDIA_COMPRESSION_FORMATS = new Set([
  "mp4",
  "webm",
  "mp3",
  "wav",
  "ogg",
  "flac",
  "m4a",
  "aac",
]);

const TEXT_COMPRESSION_FORMATS = new Set([
  "json",
  "xml",
  "html",
  "yaml",
  "yml",
  "csv",
  "tsv",
  "txt",
  "md",
  "rtf",
]);

export function isSupportedCompressionFormat(format: string): boolean {
  const clean = format.toLowerCase().replace(/^\.+/, "");
  return (
    clean === "pdf" ||
    IMAGE_COMPRESSION_FORMATS.has(clean) ||
    PACKAGE_COMPRESSION_FORMATS.has(clean) ||
    MEDIA_COMPRESSION_FORMATS.has(clean) ||
    TEXT_COMPRESSION_FORMATS.has(clean)
  );
}

export async function compressFileBuffer(
  inputBuffer: Buffer,
  format: string,
  mimeType: string,
  level: CompressionLevel = "recommended"
): Promise<CompressionResult> {
  const startTime = Date.now();
  const originalSize = inputBuffer.length;
  const cleanFormat = format.toLowerCase().replace(/^\.+/, "");

  let compressed: Buffer = inputBuffer;

  try {
    if (IMAGE_COMPRESSION_FORMATS.has(cleanFormat)) {
      compressed = await compressImage(inputBuffer, cleanFormat, level);
    } else if (cleanFormat === "pdf") {
      compressed = await compressPdf(inputBuffer, level);
    } else if (PACKAGE_COMPRESSION_FORMATS.has(cleanFormat)) {
      compressed = await compressZipPackage(inputBuffer, level);
    } else if (MEDIA_COMPRESSION_FORMATS.has(cleanFormat)) {
      compressed = await compressMediaWithFfmpeg(inputBuffer, cleanFormat, level);
    } else if (TEXT_COMPRESSION_FORMATS.has(cleanFormat)) {
      compressed = compressTextData(inputBuffer, cleanFormat, level);
    }
  } catch {
    compressed = inputBuffer;
  }

  if (compressed.length >= originalSize || compressed.length === 0) {
    compressed = inputBuffer;
  }

  const compressedSize = compressed.length;
  const savedBytes = Math.max(0, originalSize - compressedSize);
  const savedPercentage =
    originalSize > 0
      ? parseFloat(((savedBytes / originalSize) * 100).toFixed(1))
      : 0;

  return {
    originalSizeBytes: originalSize,
    compressedSizeBytes: compressedSize,
    savedBytes,
    savedPercentage,
    mimeType,
    compressedBuffer: compressed,
    durationMs: Date.now() - startTime,
  };
}

async function compressImage(
  buffer: Buffer,
  format: string,
  level: CompressionLevel
): Promise<Buffer> {
  if (format === "svg") {
    return compressSvg(buffer, level);
  }

  if (format === "gif") {
    const coloursMap: Record<CompressionLevel, number> = {
      low: 256,
      recommended: 128,
      extreme: 64,
    };
    return sharp(buffer, { animated: true })
      .gif({
        colours: coloursMap[level],
        effort: level === "low" ? 6 : 8,
        dither: level === "extreme" ? 0.5 : 0.8,
      })
      .toBuffer();
  }

  if (format === "bmp") {
    let pipeline = (await loadSharpCompatibleImage(buffer)).rotate().ensureAlpha();
    const meta = await pipeline.metadata();
    if (level === "extreme" && meta.width && meta.height) {
      const maxDim = Math.max(meta.width, meta.height);
      if (maxDim > 1920) {
        pipeline = pipeline.resize({
          width: meta.width >= meta.height ? 1920 : undefined,
          height: meta.height > meta.width ? 1920 : undefined,
          withoutEnlargement: true,
        });
      }
    }
    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    let hasTransparency = false;
    for (let i = 3; i < data.length; i += 4) {
      if ((data[i] ?? 255) < 255) {
        hasTransparency = true;
        break;
      }
    }
    return encodeRgbaToBmp(data, info.width, info.height, hasTransparency);
  }

  if (format === "webp") {
    const qualityMap: Record<CompressionLevel, number> = {
      low: 85,
      recommended: 70,
      extreme: 45,
    };
    const webpMeta = await sharp(buffer, { animated: true }).metadata();
    const isAnimatedWebp = (webpMeta.pages ?? 1) > 1;
    let webpPipeline = sharp(buffer, { animated: isAnimatedWebp });
    if (!isAnimatedWebp) {
      webpPipeline = webpPipeline.rotate();
      if (level === "extreme" && webpMeta.width && webpMeta.height) {
        const maxDim = Math.max(webpMeta.width, webpMeta.height);
        if (maxDim > 2560) {
          webpPipeline = webpPipeline.resize({
            width: webpMeta.width > webpMeta.height ? 2560 : undefined,
            height: webpMeta.height >= webpMeta.width ? 2560 : undefined,
            withoutEnlargement: true,
          });
        }
      }
    }
    return webpPipeline
      .webp({
        quality: qualityMap[level],
        effort: level === "low" ? 5 : 6,
      })
      .toBuffer();
  }

  let img = (await loadSharpCompatibleImage(buffer)).rotate();
  const metadata = await img.metadata();

  if (level === "extreme" && metadata.width && metadata.height) {
    const maxDim = Math.max(metadata.width, metadata.height);
    if (maxDim > 2560) {
      img = img.resize({
        width: metadata.width > metadata.height ? 2560 : undefined,
        height: metadata.height >= metadata.width ? 2560 : undefined,
        withoutEnlargement: true,
      });
    }
  }

  if (format === "jpg" || format === "jpeg") {
    const qualityMap: Record<CompressionLevel, number> = {
      low: 86,
      recommended: 72,
      extreme: 45,
    };
    return img
      .jpeg({
        quality: qualityMap[level],
        mozjpeg: true,
        progressive: true,
      })
      .toBuffer();
  }

  if (format === "png") {
    if (level === "low") {
      return img.png({ compressionLevel: 9, effort: 8, adaptiveFiltering: true }).toBuffer();
    }
    if (level === "recommended") {
      return img
        .png({
          compressionLevel: 9,
          palette: true,
          quality: 78,
          effort: 8,
        })
        .toBuffer();
    }
    return img
      .png({
        compressionLevel: 9,
        palette: true,
        quality: 52,
        colours: 128,
        effort: 9,
      })
      .toBuffer();
  }

  if (format === "avif") {
    const qualityMap: Record<CompressionLevel, number> = {
      low: 78,
      recommended: 58,
      extreme: 36,
    };
    return img
      .avif({
        quality: qualityMap[level],
        effort: 4,
      })
      .toBuffer();
  }

  if (format === "tiff") {
    if (level === "low") {
      return img
        .tiff({
          compression: "deflate",
          predictor: "horizontal",
        })
        .toBuffer();
    }
    const tiffQuality = level === "recommended" ? 75 : 50;
    return img
      .flatten({ background: "#ffffff" })
      .tiff({
        compression: "jpeg",
        quality: tiffQuality,
      })
      .toBuffer();
  }

  return buffer;
}

function compressSvg(buffer: Buffer, level: CompressionLevel): Buffer {
  let svg = buffer.toString("utf8");
  svg = svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();

  if (level === "recommended" || level === "extreme") {
    const decimals = level === "extreme" ? 1 : 2;
    svg = svg.replace(/(-?\d+\.\d{3,})/g, (m) => {
      const n = parseFloat(m);
      return Number.isNaN(n) ? m : Number(n.toFixed(decimals)).toString();
    });
  }

  return Buffer.from(svg, "utf8");
}

async function compressPdf(buffer: Buffer, level: CompressionLevel): Promise<Buffer> {
  const srcDoc = await PDFDocument.load(buffer, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  const jpegQualityMap: Record<CompressionLevel, number> = {
    low: 82,
    recommended: 62,
    extreme: 38,
  };
  const targetJpegQuality = jpegQualityMap[level];

  const indirectObjects = srcDoc.context.enumerateIndirectObjects();
  for (const [, pdfObj] of indirectObjects) {
    if (!(pdfObj instanceof PDFRawStream)) continue;

    const subtype = pdfObj.dict.lookup(PDFName.of("Subtype"));
    const filter = pdfObj.dict.lookup(PDFName.of("Filter"));
    const subtypeStr = subtype ? subtype.toString() : "";
    const filterStr = filter ? filter.toString() : "";

    if (subtypeStr === "/Image" && filterStr === "/DCTDecode") {
      const originalImgBytes = Buffer.from(pdfObj.contents);
      if (originalImgBytes.length < 1024) continue;

      try {
        let pipeline = sharp(originalImgBytes);
        const meta = await pipeline.metadata();
        let newWidth = meta.width;
        let newHeight = meta.height;

        if (level === "extreme" && meta.width && meta.height) {
          const maxDim = Math.max(meta.width, meta.height);
          if (maxDim > 1600) {
            const scale = 1600 / maxDim;
            newWidth = Math.max(1, Math.round(meta.width * scale));
            newHeight = Math.max(1, Math.round(meta.height * scale));
            pipeline = pipeline.resize(newWidth, newHeight, { fit: "fill" });
          }
        }

        const recompressed = await pipeline
          .jpeg({ quality: targetJpegQuality, mozjpeg: true, progressive: true })
          .toBuffer();

        if (recompressed.length < originalImgBytes.length) {
          (pdfObj as unknown as { contents: Uint8Array }).contents = new Uint8Array(
            recompressed
          );
          pdfObj.dict.set(PDFName.of("Length"), srcDoc.context.obj(recompressed.length));
          if (newWidth && newHeight && (newWidth !== meta.width || newHeight !== meta.height)) {
            pdfObj.dict.set(PDFName.of("Width"), srcDoc.context.obj(newWidth));
            pdfObj.dict.set(PDFName.of("Height"), srcDoc.context.obj(newHeight));
          }
        }
      } catch {
        // Keep original embedded stream on unsupported color space (e.g. CMYK)
      }
    }
  }

  srcDoc.setTitle("");
  srcDoc.setAuthor("");
  srcDoc.setSubject("");
  srcDoc.setKeywords([]);
  srcDoc.setProducer("FileFlow");
  srcDoc.setCreator("FileFlow");

  const directSaved = Buffer.from(
    await srcDoc.save({ useObjectStreams: true, addDefaultPage: false })
  );

  let best = directSaved.length < buffer.length ? directSaved : buffer;

  try {
    const cleanDoc = await PDFDocument.create();
    const indices = srcDoc.getPageIndices();
    if (indices.length > 0) {
      const copied = await cleanDoc.copyPages(srcDoc, indices);
      for (const p of copied) {
        cleanDoc.addPage(p);
      }
      const rebuiltSaved = Buffer.from(
        await cleanDoc.save({ useObjectStreams: true, addDefaultPage: false })
      );
      if (rebuiltSaved.length > 0 && rebuiltSaved.length < best.length) {
        best = rebuiltSaved;
      }
    }
  } catch {
    // Keep directSaved if page copy fails
  }

  return best;
}

async function compressZipPackage(
  buffer: Buffer,
  level: CompressionLevel
): Promise<Buffer> {
  try {
    const reader = new ZipReader(buffer);
    const files = reader.listFiles();
    if (files.length === 0) return buffer;

    const writer = new ZipWriter();

    for (const filename of files) {
      if (
        filename.includes("docProps/thumbnail.jpeg") ||
        filename.includes("docProps/thumbnail.jpg") ||
        filename.includes("docProps/thumbnail.png") ||
        filename.includes("docProps/thumbnail.wmf") ||
        filename.includes("docProps/thumbnail.emf")
      ) {
        continue;
      }

      const fileData = reader.readFile(filename);
      if (!fileData) continue;

      let optimizedEntry = fileData;
      const extMatch = filename.match(/\.(jpe?g|png|webp)$/i);
      const isEmbeddedOfficeMedia =
        /^(?:word|ppt|xl)\/media\//i.test(filename) || /^Pictures\//i.test(filename);

      if (extMatch && extMatch[1] && (isEmbeddedOfficeMedia || fileData.length > 4096)) {
        try {
          const reencoded = await compressImage(
            fileData,
            extMatch[1].toLowerCase(),
            level
          );
          if (reencoded.length < fileData.length) {
            optimizedEntry = reencoded;
          }
        } catch {
          optimizedEntry = fileData;
        }
      }

      const isPrecompressedMedia = /\.(jpe?g|png|webp|avif|mp4|mp3|zip)$/i.test(filename);
      writer.addFile(filename, optimizedEntry, !isPrecompressedMedia);
    }

    const repacked = writer.toBuffer();
    return repacked.length < buffer.length ? repacked : buffer;
  } catch {
    return buffer;
  }
}

let cachedFfmpegBinary: string | null | undefined;

async function resolveFfmpegBinary(): Promise<string | null> {
  if (cachedFfmpegBinary !== undefined) {
    return cachedFfmpegBinary;
  }
  try {
    const probeCmd = process.platform === "win32" ? "where" : "which";
    const { stdout } = await execFileAsync(probeCmd, ["ffmpeg"]);
    const line = stdout.trim().split(/\r?\n/)[0];
    cachedFfmpegBinary = line || null;
  } catch {
    cachedFfmpegBinary = null;
  }
  return cachedFfmpegBinary;
}

async function compressMediaWithFfmpeg(
  buffer: Buffer,
  format: string,
  level: CompressionLevel
): Promise<Buffer> {
  const ffmpegBin = await resolveFfmpegBinary();
  if (!ffmpegBin) {
    return buffer;
  }

  const tmpDir = path.join(
    os.tmpdir(),
    `fileflow_comp_${crypto.randomUUID()}`
  );
  await fs.promises.mkdir(tmpDir, { recursive: true });

  const inputPath = path.join(tmpDir, `in.${format}`);
  const outputPath = path.join(tmpDir, `out.${format}`);

  try {
    await fs.promises.writeFile(inputPath, buffer);

    const args: string[] = ["-y", "-i", inputPath, "-map_metadata", "-1"];

    if (format === "mp4") {
      const crf = level === "low" ? "25" : level === "recommended" ? "29" : "34";
      const audioBr = level === "low" ? "160k" : level === "recommended" ? "128k" : "96k";
      const scaleFilter =
        level === "extreme"
          ? "scale=trunc(min(1280\\,iw)/2)*2:trunc(ow/a/2)*2"
          : "scale=trunc(iw/2)*2:trunc(ih/2)*2";
      args.push(
        "-vf",
        scaleFilter,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        crf,
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        audioBr,
        "-movflags",
        "+faststart"
      );
    } else if (format === "webm") {
      const crf = level === "low" ? "32" : level === "recommended" ? "37" : "43";
      const audioBr = level === "low" ? "128k" : level === "recommended" ? "96k" : "64k";
      args.push(
        "-c:v",
        "libvpx-vp9",
        "-crf",
        crf,
        "-b:v",
        "0",
        "-deadline",
        "good",
        "-cpu-used",
        "4",
        "-c:a",
        "libopus",
        "-b:a",
        audioBr
      );
    } else if (format === "mp3") {
      const br = level === "low" ? "192k" : level === "recommended" ? "128k" : "96k";
      args.push("-vn", "-c:a", "libmp3lame", "-b:a", br);
    } else if (format === "m4a") {
      const br = level === "low" ? "160k" : level === "recommended" ? "128k" : "80k";
      args.push("-vn", "-c:a", "aac", "-b:a", br, "-movflags", "+faststart");
    } else if (format === "aac") {
      const br = level === "low" ? "160k" : level === "recommended" ? "128k" : "80k";
      args.push("-vn", "-c:a", "aac", "-b:a", br, "-f", "adts");
    } else if (format === "ogg") {
      const q = level === "low" ? "5" : level === "recommended" ? "3" : "1";
      args.push("-vn", "-c:a", "libvorbis", "-q:a", q);
    } else if (format === "flac") {
      const cl = level === "low" ? "6" : level === "recommended" ? "8" : "12";
      args.push("-vn", "-c:a", "flac", "-compression_level", cl);
    } else if (format === "wav") {
      if (level === "extreme") {
        args.push("-vn", "-c:a", "pcm_s16le", "-ar", "22050");
      } else {
        args.push("-vn", "-c:a", "pcm_s16le");
      }
    }

    args.push(outputPath);

    await execFileAsync(ffmpegBin, args, { timeout: 60000, maxBuffer: 20 * 1024 * 1024 });

    if (fs.existsSync(outputPath)) {
      const outBuf = await fs.promises.readFile(outputPath);
      if (outBuf.length > 0 && outBuf.length < buffer.length) {
        return outBuf;
      }
    }
    return buffer;
  } catch {
    return buffer;
  } finally {
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore temp cleanup failure
    }
  }
}

function compressTextData(
  buffer: Buffer,
  format: string,
  _level: CompressionLevel
): Buffer {
  const text = buffer.toString("utf8");

  if (format === "json") {
    try {
      const parsed = JSON.parse(text);
      const minified = JSON.stringify(parsed);
      return Buffer.from(minified, "utf8");
    } catch {
      return buffer;
    }
  }

  if (format === "html") {
    const preservedBlocks: string[] = [];
    const withPlaceholders = text.replace(
      /<(pre|code|textarea|script|style)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi,
      (match) => {
        const idx = preservedBlocks.length;
        preservedBlocks.push(match);
        return `__HTML_PRESERVE_${idx}__`;
      }
    );

    const minified = withPlaceholders
      .replace(/<!--(?!\[if)[\s\S]*?-->/g, "")
      .replace(/>\s+</g, "><")
      .replace(/\s{2,}/g, " ")
      .trim();

    const restored = minified.replace(
      /__HTML_PRESERVE_(\d+)__/g,
      (_m, idxStr: string) => preservedBlocks[parseInt(idxStr, 10)] ?? ""
    );

    return Buffer.from(restored, "utf8");
  }

  if (format === "xml") {
    const minified = text
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/>\s+</g, "><")
      .replace(/\r?\n\s*/g, "")
      .trim();
    return Buffer.from(minified, "utf8");
  }

  if (format === "yaml" || format === "yml") {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+$/, ""))
      .filter((l) => l.trim().length > 0 && !l.trim().startsWith("#"));
    return Buffer.from(lines.join("\n"), "utf8");
  }

  if (
    format === "csv" ||
    format === "tsv" ||
    format === "txt" ||
    format === "md" ||
    format === "rtf"
  ) {
    const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
    return Buffer.from(lines.join("\n").trim(), "utf8");
  }

  return buffer;
}
