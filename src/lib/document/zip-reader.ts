// File: src/lib/document/zip-reader.ts

import zlib from "zlib";

export interface ZipEntry {
  filename: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  dataOffset: number;
  localHeaderOffset: number;
}

export const MAX_ZIP_ENTRIES = 2500;
export const MAX_ENTRY_UNCOMPRESSED_BYTES = 64 * 1024 * 1024; // 64 MB per entry
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 150 * 1024 * 1024; // 150 MB aggregate
export const MAX_COMPRESSION_RATIO = 120;
export const MAX_ZIP_PATH_DEPTH = 16;
export const MAX_ZIP_FILENAME_LENGTH = 255;

/**
 * Validates that a ZIP archive entry path is strictly relative and free of
 * Zip Slip traversal (..), absolute paths, Windows drive prefixes, or null/control bytes.
 */
export function isSafeZipEntryPath(filename: string): boolean {
  if (
    !filename ||
    typeof filename !== "string" ||
    filename.length > MAX_ZIP_FILENAME_LENGTH
  ) {
    return false;
  }

  // Reject null bytes and ASCII control characters
  if (/[\x00-\x1f\x7f]/.test(filename)) {
    return false;
  }

  // Reject Windows backslashes, leading slashes, or drive letters (e.g. C:)
  if (
    filename.includes("\\") ||
    filename.startsWith("/") ||
    /^[a-zA-Z]:/.test(filename)
  ) {
    return false;
  }

  const segments = filename.split("/").filter((s) => s.length > 0);
  if (segments.length === 0 || segments.length > MAX_ZIP_PATH_DEPTH) {
    return false;
  }

  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      return false;
    }
  }

  return true;
}

export class ZipReader {
  private buffer: Buffer;
  private entries: Map<string, ZipEntry> = new Map();
  private totalDecompressedBytes: number = 0;

  public constructor(buffer: Buffer) {
    this.buffer = buffer;
    this.parseCentralDirectory();
  }

  private parseCentralDirectory(): void {
    const buf = this.buffer;
    if (buf.length < 22) {
      return;
    }

    // Locate End of Central Directory (EOCD) signature: 0x06054b50
    let eocdOffset = -1;
    const maxSearch = Math.min(buf.length, 65536 + 22);
    const startSearch = buf.length - 22;

    for (let i = startSearch; i >= buf.length - maxSearch; i--) {
      if (
        buf[i] === 0x50 &&
        buf[i + 1] === 0x4b &&
        buf[i + 2] === 0x05 &&
        buf[i + 3] === 0x06
      ) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      // Fallback: Attempt sequential scan of local file headers
      this.parseLocalHeadersSequential();
      return;
    }

    const rawTotalEntries = buf.readUInt16LE(eocdOffset + 10);
    const totalEntries = Math.min(rawTotalEntries, MAX_ZIP_ENTRIES);
    const cdOffset = buf.readUInt32LE(eocdOffset + 16);

    let offset = cdOffset;
    for (let i = 0; i < totalEntries && offset + 46 <= eocdOffset; i++) {
      if (
        buf[offset] !== 0x50 ||
        buf[offset + 1] !== 0x4b ||
        buf[offset + 2] !== 0x01 ||
        buf[offset + 3] !== 0x02
      ) {
        break;
      }

      const compressionMethod = buf.readUInt16LE(offset + 10);
      const compressedSize = buf.readUInt32LE(offset + 20);
      const uncompressedSize = buf.readUInt32LE(offset + 24);
      const filenameLength = buf.readUInt16LE(offset + 28);
      const extraLength = buf.readUInt16LE(offset + 30);
      const commentLength = buf.readUInt16LE(offset + 32);
      const localHeaderOffset = buf.readUInt32LE(offset + 42);

      if (offset + 46 + filenameLength > buf.length) {
        break;
      }

      const filename = buf.toString(
        "utf8",
        offset + 46,
        offset + 46 + filenameLength
      );

      let dataOffset = 0;
      if (localHeaderOffset + 30 <= buf.length) {
        const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
        const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
        dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;
      }

      if (isSafeZipEntryPath(filename) && this.entries.size < MAX_ZIP_ENTRIES) {
        this.entries.set(filename, {
          filename,
          compressionMethod,
          compressedSize,
          uncompressedSize,
          dataOffset,
          localHeaderOffset,
        });
      }

      offset += 46 + filenameLength + extraLength + commentLength;
    }
  }

  private parseLocalHeadersSequential(): void {
    const buf = this.buffer;
    let offset = 0;

    while (offset + 30 <= buf.length && this.entries.size < MAX_ZIP_ENTRIES) {
      if (
        buf[offset] !== 0x50 ||
        buf[offset + 1] !== 0x4b ||
        buf[offset + 2] !== 0x03 ||
        buf[offset + 3] !== 0x04
      ) {
        break;
      }

      const compressionMethod = buf.readUInt16LE(offset + 8);
      const compressedSize = buf.readUInt32LE(offset + 18);
      const uncompressedSize = buf.readUInt32LE(offset + 22);
      const filenameLength = buf.readUInt16LE(offset + 26);
      const extraLength = buf.readUInt16LE(offset + 28);

      if (offset + 30 + filenameLength > buf.length) {
        break;
      }

      const filename = buf.toString(
        "utf8",
        offset + 30,
        offset + 30 + filenameLength
      );
      const dataOffset = offset + 30 + filenameLength + extraLength;

      if (isSafeZipEntryPath(filename)) {
        this.entries.set(filename, {
          filename,
          compressionMethod,
          compressedSize,
          uncompressedSize,
          dataOffset,
          localHeaderOffset: offset,
        });
      }

      offset = dataOffset + compressedSize;
    }
  }

  public listFiles(): string[] {
    return Array.from(this.entries.keys());
  }

  public hasFile(filename: string): boolean {
    if (!isSafeZipEntryPath(filename)) {
      return false;
    }
    return this.entries.has(filename);
  }

  public readFile(filename: string): Buffer | null {
    if (!isSafeZipEntryPath(filename)) {
      return null;
    }

    const entry = this.entries.get(filename);
    if (!entry) return null;

    if (
      entry.dataOffset < 0 ||
      entry.compressedSize < 0 ||
      entry.dataOffset + entry.compressedSize > this.buffer.length
    ) {
      return null;
    }

    if (entry.uncompressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES) {
      return null;
    }

    if (
      entry.compressedSize > 0 &&
      entry.uncompressedSize > 65536 &&
      entry.uncompressedSize / entry.compressedSize > MAX_COMPRESSION_RATIO
    ) {
      return null;
    }

    const compressed = this.buffer.subarray(
      entry.dataOffset,
      entry.dataOffset + entry.compressedSize
    );

    if (entry.compressionMethod === 0) {
      if (
        compressed.length > MAX_ENTRY_UNCOMPRESSED_BYTES ||
        this.totalDecompressedBytes + compressed.length >
          MAX_TOTAL_UNCOMPRESSED_BYTES
      ) {
        return null;
      }
      this.totalDecompressedBytes += compressed.length;
      return Buffer.from(compressed);
    }

    if (entry.compressionMethod === 8) {
      try {
        const remainingQuota = Math.max(
          0,
          MAX_TOTAL_UNCOMPRESSED_BYTES - this.totalDecompressedBytes
        );
        const maxAllowed = Math.min(
          MAX_ENTRY_UNCOMPRESSED_BYTES,
          remainingQuota
        );
        if (maxAllowed <= 0) {
          return null;
        }

        const inflated = zlib.inflateRawSync(compressed, {
          maxOutputLength: maxAllowed,
        });

        if (
          compressed.length > 0 &&
          inflated.length > 65536 &&
          inflated.length / compressed.length > MAX_COMPRESSION_RATIO
        ) {
          return null;
        }

        this.totalDecompressedBytes += inflated.length;
        return inflated;
      } catch {
        return null;
      }
    }

    return null;
  }

  public readText(filename: string, encoding: BufferEncoding = "utf8"): string | null {
    const buf = this.readFile(filename);
    if (!buf) return null;
    return buf.toString(encoding);
  }
}
