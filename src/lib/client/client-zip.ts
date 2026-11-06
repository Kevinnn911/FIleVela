// File: src/lib/client/client-zip.ts

/**
 * Pure browser-native ZIP archive builder (STORE mode + IEEE 802.3 CRC-32 + UTF-8 flag 0x0800).
 * Bundles multiple local Privacy Mode Blobs into a single downloadable .zip archive
 * without transmitting any bytes to the server or triggering multi-download popup blockers.
 */

export interface ClientZipEntry {
  filename: string;
  data: Uint8Array;
}

const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    const idx = (crc ^ bytes[i]!) & 0xff;
    crc = (CRC32_TABLE[idx]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function deduplicateFilename(rawName: string, used: Set<string>): string {
  const clean = rawName.replace(/[\\/]+/g, '_').trim() || 'berkas.bin';
  if (!used.has(clean.toLowerCase())) {
    used.add(clean.toLowerCase());
    return clean;
  }
  const dotIdx = clean.lastIndexOf('.');
  const stem = dotIdx > 0 ? clean.slice(0, dotIdx) : clean;
  const ext = dotIdx > 0 ? clean.slice(dotIdx) : '';
  let counter = 2;
  while (used.has(`${stem}_${counter}${ext}`.toLowerCase())) {
    counter++;
  }
  const candidate = `${stem}_${counter}${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

export function buildClientZipBlob(entries: ClientZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const usedNames = new Set<string>();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  let localOffset = 0;

  for (const entry of entries) {
    const safeName = deduplicateFilename(entry.filename, usedNames);
    const nameBytes = encoder.encode(safeName);
    const dataBytes = entry.data;
    const crc = computeCrc32(dataBytes);
    const size = dataBytes.byteLength;

    // Local File Header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.byteLength);
    const lView = new DataView(localHeader.buffer);
    lView.setUint32(0, 0x04034b50, true);
    lView.setUint16(4, 20, true); // Version needed 2.0
    lView.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lView.setUint16(8, 0, true); // STORE method
    lView.setUint16(10, dosTime, true);
    lView.setUint16(12, dosDate, true);
    lView.setUint32(14, crc, true);
    lView.setUint32(18, size, true);
    lView.setUint32(22, size, true);
    lView.setUint16(26, nameBytes.byteLength, true);
    lView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    // Central Directory Header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.byteLength);
    const cView = new DataView(centralHeader.buffer);
    cView.setUint32(0, 0x02014b50, true);
    cView.setUint16(4, 20, true);
    cView.setUint16(6, 20, true);
    cView.setUint16(8, 0x0800, true); // UTF-8 filename flag
    cView.setUint16(10, 0, true); // STORE method
    cView.setUint16(12, dosTime, true);
    cView.setUint16(14, dosDate, true);
    cView.setUint32(16, crc, true);
    cView.setUint32(20, size, true);
    cView.setUint32(24, size, true);
    cView.setUint16(28, nameBytes.byteLength, true);
    cView.setUint16(30, 0, true);
    cView.setUint16(32, 0, true);
    cView.setUint16(34, 0, true);
    cView.setUint16(36, 0, true);
    cView.setUint32(38, 0, true);
    cView.setUint32(42, localOffset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    localOffset += localHeader.byteLength + size;
  }

  let centralSize = 0;
  for (const part of centralParts) {
    centralSize += part.byteLength;
  }

  const eocd = new Uint8Array(22);
  const eView = new DataView(eocd.buffer);
  eView.setUint32(0, 0x06054b50, true);
  eView.setUint16(4, 0, true);
  eView.setUint16(6, 0, true);
  eView.setUint16(8, centralParts.length, true);
  eView.setUint16(10, centralParts.length, true);
  eView.setUint32(12, centralSize, true);
  eView.setUint32(16, localOffset, true);
  eView.setUint16(20, 0, true);

  const totalLength = localOffset + centralSize + eocd.byteLength;
  const archive = new Uint8Array(totalLength);
  let cursor = 0;
  for (const part of localParts) {
    archive.set(part, cursor);
    cursor += part.byteLength;
  }
  for (const part of centralParts) {
    archive.set(part, cursor);
    cursor += part.byteLength;
  }
  archive.set(eocd, cursor);

  return new Blob([archive], { type: 'application/zip' });
}

