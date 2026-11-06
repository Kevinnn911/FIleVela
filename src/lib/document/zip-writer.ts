// File: src/lib/document/zip-writer.ts

import zlib from "zlib";

interface WriteEntry {
  filename: string;
  data: Buffer;
  crc32: number;
  compressedData: Buffer;
  compressionMethod: number;
  localHeaderOffset: number;
}

const ZIP_UTF8_FILENAME_FLAG = 0x0800;

export class ZipWriter {
  private files: Array<{ filename: string; content: Buffer; compress: boolean }> = [];

  public addFile(
    filename: string,
    content: Buffer | string,
    compress: boolean = true
  ): this {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    this.files.push({ filename, content: buf, compress });
    return this;
  }

  public toBuffer(): Buffer {
    const entries: WriteEntry[] = [];
    const localChunks: Buffer[] = [];
    let currentOffset = 0;

    for (const item of this.files) {
      const crc = computeCrc32(item.content);
      let compressedData: Buffer;
      let compressionMethod = 8;

      if (item.compress && item.content.length > 0) {
        try {
          const deflated = zlib.deflateRawSync(item.content, { level: 6 });
          if (deflated.length < item.content.length) {
            compressedData = deflated;
          } else {
            compressedData = item.content;
            compressionMethod = 0;
          }
        } catch {
          compressedData = item.content;
          compressionMethod = 0;
        }
      } else {
        compressedData = item.content;
        compressionMethod = 0;
      }

      const filenameBytes = Buffer.from(item.filename, "utf8");
      const localHeader = Buffer.alloc(30 + filenameBytes.length);

      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(ZIP_UTF8_FILENAME_FLAG, 6);
      localHeader.writeUInt16LE(compressionMethod, 8);
      localHeader.writeUInt16LE(0, 10);
      localHeader.writeUInt16LE(0, 12);
      localHeader.writeUInt32LE(crc, 14);
      localHeader.writeUInt32LE(compressedData.length, 18);
      localHeader.writeUInt32LE(item.content.length, 22);
      localHeader.writeUInt16LE(filenameBytes.length, 26);
      localHeader.writeUInt16LE(0, 28);
      filenameBytes.copy(localHeader, 30);

      entries.push({
        filename: item.filename,
        data: item.content,
        crc32: crc,
        compressedData,
        compressionMethod,
        localHeaderOffset: currentOffset,
      });

      localChunks.push(localHeader, compressedData);
      currentOffset += localHeader.length + compressedData.length;
    }

    const cdOffset = currentOffset;
    const cdChunks: Buffer[] = [];

    for (const entry of entries) {
      const filenameBytes = Buffer.from(entry.filename, "utf8");
      const cdHeader = Buffer.alloc(46 + filenameBytes.length);

      cdHeader.writeUInt32LE(0x02014b50, 0);
      cdHeader.writeUInt16LE(20, 4);
      cdHeader.writeUInt16LE(20, 6);
      cdHeader.writeUInt16LE(ZIP_UTF8_FILENAME_FLAG, 8);
      cdHeader.writeUInt16LE(entry.compressionMethod, 10);
      cdHeader.writeUInt16LE(0, 12);
      cdHeader.writeUInt16LE(0, 14);
      cdHeader.writeUInt32LE(entry.crc32, 16);
      cdHeader.writeUInt32LE(entry.compressedData.length, 20);
      cdHeader.writeUInt32LE(entry.data.length, 24);
      cdHeader.writeUInt16LE(filenameBytes.length, 28);
      cdHeader.writeUInt16LE(0, 30);
      cdHeader.writeUInt16LE(0, 32);
      cdHeader.writeUInt16LE(0, 34);
      cdHeader.writeUInt16LE(0, 36);
      cdHeader.writeUInt32LE(0, 38);
      cdHeader.writeUInt32LE(entry.localHeaderOffset, 42);
      filenameBytes.copy(cdHeader, 46);

      cdChunks.push(cdHeader);
      currentOffset += cdHeader.length;
    }

    const cdSize = currentOffset - cdOffset;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdOffset, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([...localChunks, ...cdChunks, eocd]);
  }
}

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

export function computeCrc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i]!;
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
