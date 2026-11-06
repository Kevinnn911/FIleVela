// File: src/lib/image/bmp-ico-codec.ts

import fs from "fs";
import sharp from "sharp";

export interface RawRgbaImage {
  data: Buffer;
  width: number;
  height: number;
  hasAlpha: boolean;
}

export function isBmpBuffer(buf: Buffer): boolean {
  return buf.length >= 26 && buf[0] === 0x42 && buf[1] === 0x4d;
}

export function isIcoBuffer(buf: Buffer): boolean {
  return (
    buf.length >= 6 &&
    buf[0] === 0x00 &&
    buf[1] === 0x00 &&
    (buf[2] === 0x01 || buf[2] === 0x02) &&
    buf[3] === 0x00 &&
    buf.readUInt16LE(4) > 0
  );
}

export function isSvgBuffer(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 2048)).toString("utf8").trimStart();
  return sample.startsWith("<svg") || (sample.startsWith("<?xml") && sample.includes("<svg"));
}

function svgNeedsHighDensity(buf: Buffer): boolean {
  const head = buf.subarray(0, Math.min(buf.length, 4096)).toString("utf8");
  const svgTagMatch = head.match(/<svg\b[^>]*>/i);
  if (!svgTagMatch) return false;
  const tag = svgTagMatch[0];
  const widthMatch = tag.match(/\bwidth\s*=\s*["']([^"']+)["']/i);
  const heightMatch = tag.match(/\bheight\s*=\s*["']([^"']+)["']/i);
  if (!widthMatch || !heightMatch) {
    return true;
  }
  const wVal = widthMatch[1]?.trim() ?? "";
  const hVal = heightMatch[1]?.trim() ?? "";
  if (wVal.endsWith("%") || hVal.endsWith("%")) {
    return true;
  }
  const numW = parseFloat(wVal);
  const numH = parseFloat(hVal);
  if (Number.isNaN(numW) || Number.isNaN(numH)) {
    return true;
  }
  return false;
}

function decodeDibBody(
  buf: Buffer,
  dibOffset: number,
  pixelArrayOffsetOverride?: number,
  isIcoFrame = false
): RawRgbaImage {
  if (dibOffset + 12 > buf.length) {
    throw new Error("Header DIB BMP/ICO rusak atau terpotong.");
  }

  const headerSize = buf.readUInt32LE(dibOffset);
  let width = 0;
  let rawHeight = 0;
  let bpp = 0;
  let compression = 0;
  let clrUsed = 0;

  if (headerSize === 12) {
    width = buf.readUInt16LE(dibOffset + 4);
    rawHeight = buf.readInt16LE(dibOffset + 6);
    bpp = buf.readUInt16LE(dibOffset + 10);
  } else if (headerSize >= 40 && dibOffset + 40 <= buf.length) {
    width = buf.readInt32LE(dibOffset + 4);
    rawHeight = buf.readInt32LE(dibOffset + 8);
    bpp = buf.readUInt16LE(dibOffset + 14);
    compression = buf.readUInt32LE(dibOffset + 16);
    clrUsed = buf.readUInt32LE(dibOffset + 32);
  } else {
    throw new Error(`Ukuran header DIB BMP tidak didukung (${headerSize} byte).`);
  }

  const topDown = rawHeight < 0;
  const absHeight = Math.abs(rawHeight);
  const height = isIcoFrame ? Math.floor(absHeight / 2) : absHeight;

  if (width <= 0 || height <= 0 || width > 16384 || height > 16384) {
    throw new Error(`Dimensi BMP/ICO tidak valid (${width}x${height}).`);
  }

  if (compression !== 0 && compression !== 3 && compression !== 6) {
    throw new Error(`Kompresi internal BMP (${compression}) tidak didukung.`);
  }

  let rMask = 0x00ff0000;
  let gMask = 0x0000ff00;
  let bMask = 0x000000ff;
  let aMask = bpp === 32 ? 0xff000000 : 0;
  let extraMaskBytes = 0;

  if ((compression === 3 || compression === 6) && headerSize === 40) {
    const maskStart = dibOffset + headerSize;
    if (maskStart + 12 <= buf.length) {
      rMask = buf.readUInt32LE(maskStart);
      gMask = buf.readUInt32LE(maskStart + 4);
      bMask = buf.readUInt32LE(maskStart + 8);
      extraMaskBytes = 12;
      if (compression === 6 && maskStart + 16 <= buf.length) {
        aMask = buf.readUInt32LE(maskStart + 12);
        extraMaskBytes = 16;
      } else {
        aMask = 0;
      }
    }
  } else if ((compression === 3 || compression === 6) && headerSize >= 52 && dibOffset + 56 <= buf.length) {
    rMask = buf.readUInt32LE(dibOffset + 40);
    gMask = buf.readUInt32LE(dibOffset + 44);
    bMask = buf.readUInt32LE(dibOffset + 48);
    aMask = headerSize >= 56 ? buf.readUInt32LE(dibOffset + 52) : 0;
  } else if (bpp === 16 && compression === 0) {
    rMask = 0x7c00;
    gMask = 0x03e0;
    bMask = 0x001f;
    aMask = 0;
  }

  const paletteEntrySize = headerSize === 12 ? 3 : 4;
  const paletteCount = bpp <= 8 ? (clrUsed > 0 ? clrUsed : 1 << bpp) : 0;
  const paletteOffset = dibOffset + headerSize + extraMaskBytes;
  const computedPixelOffset = paletteOffset + paletteCount * paletteEntrySize;
  const pixelOffset =
    pixelArrayOffsetOverride !== undefined && !isIcoFrame
      ? pixelArrayOffsetOverride
      : computedPixelOffset;

  const rowStride = Math.floor((bpp * width + 31) / 32) * 4;
  const rgba = Buffer.alloc(width * height * 4);

  const extractChannel = (val: number, mask: number): number => {
    if (mask === 0) return 0;
    const unsignedMask = mask >>> 0;
    let shift = 0;
    let m = unsignedMask;
    while ((m & 1) === 0 && shift < 32) {
      m >>>= 1;
      shift++;
    }
    const maxVal = m >>> 0;
    if (maxVal === 0) return 0;
    const rawComp = ((val >>> 0) & unsignedMask) >>> shift;
    return Math.round((rawComp * 255) / maxVal);
  };

  let anyNonZeroAlphaIn32Bit = false;

  for (let y = 0; y < height; y++) {
    const srcRow = topDown ? y : height - 1 - y;
    const rowStart = pixelOffset + srcRow * rowStride;
    if (rowStart >= buf.length) break;

    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 255;

      if (bpp === 32) {
        const pxOff = rowStart + x * 4;
        if (pxOff + 4 <= buf.length) {
          if (compression === 3 || compression === 6) {
            const val = buf.readUInt32LE(pxOff);
            r = extractChannel(val, rMask);
            g = extractChannel(val, gMask);
            b = extractChannel(val, bMask);
            a = aMask !== 0 ? extractChannel(val, aMask) : 255;
          } else {
            b = buf[pxOff] ?? 0;
            g = buf[pxOff + 1] ?? 0;
            r = buf[pxOff + 2] ?? 0;
            a = buf[pxOff + 3] ?? 0;
          }
          if (a !== 0) {
            anyNonZeroAlphaIn32Bit = true;
          }
        }
      } else if (bpp === 24) {
        const pxOff = rowStart + x * 3;
        if (pxOff + 3 <= buf.length) {
          b = buf[pxOff] ?? 0;
          g = buf[pxOff + 1] ?? 0;
          r = buf[pxOff + 2] ?? 0;
        }
      } else if (bpp === 16) {
        const pxOff = rowStart + x * 2;
        if (pxOff + 2 <= buf.length) {
          const val = buf.readUInt16LE(pxOff);
          r = extractChannel(val, rMask);
          g = extractChannel(val, gMask);
          b = extractChannel(val, bMask);
        }
      } else if (bpp === 8 || bpp === 4 || bpp === 1) {
        let colorIdx = 0;
        if (bpp === 8) {
          colorIdx = buf[rowStart + x] ?? 0;
        } else if (bpp === 4) {
          const byteVal = buf[rowStart + (x >> 1)] ?? 0;
          colorIdx = (x & 1) === 0 ? (byteVal >> 4) & 0x0f : byteVal & 0x0f;
        } else {
          const byteVal = buf[rowStart + (x >> 3)] ?? 0;
          colorIdx = (byteVal >> (7 - (x & 7))) & 0x01;
        }
        const palOff = paletteOffset + colorIdx * paletteEntrySize;
        if (palOff + 3 <= buf.length) {
          b = buf[palOff] ?? 0;
          g = buf[palOff + 1] ?? 0;
          r = buf[palOff + 2] ?? 0;
        }
      } else {
        throw new Error(`Kedalaman warna BMP/ICO (${bpp}-bit) tidak didukung.`);
      }

      rgba[dstIdx] = r;
      rgba[dstIdx + 1] = g;
      rgba[dstIdx + 2] = b;
      rgba[dstIdx + 3] = a;
    }
  }

  let hasAlpha = false;

  if (bpp === 32) {
    if (!anyNonZeroAlphaIn32Bit) {
      for (let i = 3; i < rgba.length; i += 4) {
        rgba[i] = 255;
      }
      hasAlpha = false;
    } else {
      for (let i = 3; i < rgba.length; i += 4) {
        if ((rgba[i] ?? 255) < 255) {
          hasAlpha = true;
          break;
        }
      }
    }
  }

  if (isIcoFrame && bpp < 32) {
    const andMaskOffset = pixelOffset + height * rowStride;
    const andRowStride = Math.floor((width + 31) / 32) * 4;
    if (andMaskOffset + height * andRowStride <= buf.length) {
      for (let y = 0; y < height; y++) {
        const srcRow = topDown ? y : height - 1 - y;
        const maskRowStart = andMaskOffset + srcRow * andRowStride;
        for (let x = 0; x < width; x++) {
          const maskByte = buf[maskRowStart + (x >> 3)] ?? 0;
          const isTransparentBit = ((maskByte >> (7 - (x & 7))) & 1) === 1;
          if (isTransparentBit) {
            rgba[(y * width + x) * 4 + 3] = 0;
            hasAlpha = true;
          }
        }
      }
    }
  }

  return { data: rgba, width, height, hasAlpha };
}

export function decodeBmpToRgba(buf: Buffer): RawRgbaImage {
  if (!isBmpBuffer(buf)) {
    throw new Error("Buffer bukan berkas BMP yang valid.");
  }
  const pixelOffset = buf.readUInt32LE(10);
  return decodeDibBody(buf, 14, pixelOffset, false);
}

export function encodeRgbaToBmp(
  rgba: Buffer,
  width: number,
  height: number,
  preserveAlpha = true
): Buffer {
  let hasTransparency = false;
  if (preserveAlpha) {
    for (let i = 3; i < rgba.length; i += 4) {
      if ((rgba[i] ?? 255) < 255) {
        hasTransparency = true;
        break;
      }
    }
  }

  const bpp = hasTransparency ? 32 : 24;
  const bytesPerPixel = bpp / 8;
  const rowStride = Math.floor((bpp * width + 31) / 32) * 4;
  const pixelArraySize = rowStride * height;
  const dibHeaderSize = 40;
  const pixelDataOffset = 14 + dibHeaderSize;
  const totalSize = pixelDataOffset + pixelArraySize;

  const out = Buffer.alloc(totalSize);

  out.write("BM", 0, "ascii");
  out.writeUInt32LE(totalSize, 2);
  out.writeUInt32LE(0, 6);
  out.writeUInt32LE(pixelDataOffset, 10);

  out.writeUInt32LE(dibHeaderSize, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(bpp, 28);
  out.writeUInt32LE(0, 30);
  out.writeUInt32LE(pixelArraySize, 34);
  out.writeInt32LE(2835, 38);
  out.writeInt32LE(2835, 42);
  out.writeUInt32LE(0, 46);
  out.writeUInt32LE(0, 50);

  for (let y = 0; y < height; y++) {
    const dstRow = height - 1 - y;
    const dstRowStart = pixelDataOffset + dstRow * rowStride;
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = dstRowStart + x * bytesPerPixel;
      const r = rgba[srcIdx] ?? 0;
      const g = rgba[srcIdx + 1] ?? 0;
      const b = rgba[srcIdx + 2] ?? 0;
      const a = rgba[srcIdx + 3] ?? 255;

      out[dstIdx] = b;
      out[dstIdx + 1] = g;
      out[dstIdx + 2] = r;
      if (hasTransparency) {
        out[dstIdx + 3] = a;
      }
    }
  }

  return out;
}

export function extractBestIcoFrame(
  buf: Buffer
): { kind: "png"; pngBuffer: Buffer } | { kind: "rgba"; image: RawRgbaImage } {
  if (!isIcoBuffer(buf)) {
    throw new Error("Buffer bukan berkas ICO yang valid.");
  }

  const count = buf.readUInt16LE(4);
  if (count === 0 || 6 + count * 16 > buf.length) {
    throw new Error("Direktori frame ICO kosong atau terpotong.");
  }

  let bestIdx = -1;
  let bestScore = -1;

  for (let i = 0; i < count; i++) {
    const entryOff = 6 + i * 16;
    const rawW = buf[entryOff] ?? 0;
    const rawH = buf[entryOff + 1] ?? 0;
    const w = rawW === 0 ? 256 : rawW;
    const h = rawH === 0 ? 256 : rawH;
    const bpp = buf.readUInt16LE(entryOff + 6) || 32;
    const dataLen = buf.readUInt32LE(entryOff + 8);
    const dataOff = buf.readUInt32LE(entryOff + 12);

    if (dataLen === 0 || dataOff + dataLen > buf.length) {
      continue;
    }

    const score = w * h * 100 + bpp;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx === -1) {
    throw new Error("Tidak ada frame gambar valid di dalam berkas ICO.");
  }

  const entryOff = 6 + bestIdx * 16;
  const dataLen = buf.readUInt32LE(entryOff + 8);
  const dataOff = buf.readUInt32LE(entryOff + 12);
  const frameBuf = buf.subarray(dataOff, dataOff + dataLen);

  if (
    frameBuf.length >= 8 &&
    frameBuf[0] === 0x89 &&
    frameBuf[1] === 0x50 &&
    frameBuf[2] === 0x4e &&
    frameBuf[3] === 0x47
  ) {
    return { kind: "png", pngBuffer: Buffer.from(frameBuf) };
  }

  const decoded = decodeDibBody(frameBuf, 0, undefined, true);
  return { kind: "rgba", image: decoded };
}

export const MAX_IMAGE_INPUT_PIXELS = 67_108_864; // 8192 x 8192 pixel flood guard

export async function loadSharpCompatibleImage(
  input: Buffer | string,
  options?: { density?: number; animated?: boolean }
): Promise<sharp.Sharp> {
  const buf = typeof input === "string" ? await fs.promises.readFile(input) : input;

  if (isBmpBuffer(buf)) {
    const decoded = decodeBmpToRgba(buf);
    return sharp(decoded.data, {
      limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
      raw: {
        width: decoded.width,
        height: decoded.height,
        channels: 4,
      },
    });
  }

  if (isIcoBuffer(buf)) {
    const frame = extractBestIcoFrame(buf);
    if (frame.kind === "png") {
      return sharp(frame.pngBuffer, {
        failOn: "none",
        limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
      });
    }
    return sharp(frame.image.data, {
      limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
      raw: {
        width: frame.image.width,
        height: frame.image.height,
        channels: 4,
      },
    });
  }

  const sharpOpts: sharp.SharpOptions = {
    failOn: "none",
    animated: options?.animated ?? false,
    limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
  };

  if (isSvgBuffer(buf)) {
    if (typeof options?.density === "number" && Number.isFinite(options.density)) {
      sharpOpts.density = Math.max(72, Math.min(600, Math.round(options.density)));
    } else if (svgNeedsHighDensity(buf)) {
      sharpOpts.density = 300;
    }
  }

  return sharp(buf, sharpOpts);
}

