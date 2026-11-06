// File: src/lib/security/mime-detector.ts

import { ZipReader } from "@/lib/document/zip-reader";

export interface DetectedMimeInfo {
  mimeType: string;
  format: string;
  extension: string;
}

export interface MimeVerificationResult {
  valid: boolean;
  detectedMime: string | null;
  detectedFormat: string | null;
  error?: string;
}

function countCsvFieldsOutsideQuotes(line: string, delimiter: string): number {
  let inQuotes = false;
  let count = 0;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && ch === delimiter) {
      count++;
    }
  }

  return count;
}

function splitLogicalCsvLines(sample: string, maxRecords = 5): string[] {
  const records: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i]!;
    if (ch === '"') {
      current += ch;
      if (inQuotes && sample[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && sample[i + 1] === "\n") {
        i++;
      }
      if (current.trim().length > 0) {
        records.push(current);
        if (records.length >= maxRecords) {
          return records;
        }
      }
      current = "";
      continue;
    }

    current += ch;
  }

  if (!inQuotes && current.trim().length > 0 && records.length < maxRecords) {
    records.push(current);
  }

  return records;
}

function looksLikeYaml(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0 && !l.trim().startsWith("#"));

  if (lines.length === 0) return false;

  const hasDocStart = lines[0]?.trim() === "---";
  let keyValMatches = 0;
  let listMatches = 0;

  const inspectLines = hasDocStart ? lines.slice(1) : lines;
  if (inspectLines.length === 0) return false;

  for (const line of inspectLines.slice(0, 12)) {
    const trimmed = line.trim();
    if (/^[A-Za-z0-9_.-]+\s*:(?:\s+.*|$)/.test(trimmed) && !/^https?:/i.test(trimmed)) {
      keyValMatches++;
    } else if (/^-\s+\S+/.test(trimmed)) {
      listMatches++;
    }
  }

  if (hasDocStart && (keyValMatches >= 1 || listMatches >= 1)) {
    return true;
  }

  return keyValMatches >= 2 && keyValMatches + listMatches >= Math.min(inspectLines.length, 4) * 0.6;
}

/**
 * Detects the authentic MIME type of a binary buffer by inspecting
 * header signatures (magic bytes) and container manifests.
 */
export function detectMimeType(buffer: Buffer): DetectedMimeInfo | null {
  if (!buffer || buffer.length === 0) {
    return null;
  }

  // 1. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimeType: "image/png", format: "png", extension: ".png" };
  }

  // 2. JPEG / JPG: FF D8 FF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { mimeType: "image/jpeg", format: "jpg", extension: ".jpg" };
  }

  // 3. GIF: GIF87a or GIF89a
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return { mimeType: "image/gif", format: "gif", extension: ".gif" };
  }

  // 4. BMP: 42 4D ('BM')
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return { mimeType: "image/bmp", format: "bmp", extension: ".bmp" };
  }

  // 5. TIFF: Little-endian II*. or Big-endian MM.*
  if (buffer.length >= 4) {
    if (
      (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
      (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
    ) {
      return { mimeType: "image/tiff", format: "tiff", extension: ".tiff" };
    }
  }

  // 6. ICO: 00 00 01 00
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x00 &&
    buffer[1] === 0x00 &&
    buffer[2] === 0x01 &&
    buffer[3] === 0x00
  ) {
    return { mimeType: "image/x-icon", format: "ico", extension: ".ico" };
  }

  // 7. WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mimeType: "image/webp", format: "webp", extension: ".webp" };
  }

  // 8. WAV: RIFF....WAVE
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x41 &&
    buffer[10] === 0x56 &&
    buffer[11] === 0x45
  ) {
    return { mimeType: "audio/wav", format: "wav", extension: ".wav" };
  }

  // 9. OGG: OggS (4F 67 67 53)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x4f &&
    buffer[1] === 0x67 &&
    buffer[2] === 0x67 &&
    buffer[3] === 0x53
  ) {
    return { mimeType: "audio/ogg", format: "ogg", extension: ".ogg" };
  }

  // 10. FLAC: fLaC (66 4C 61 43)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x66 &&
    buffer[1] === 0x4c &&
    buffer[2] === 0x61 &&
    buffer[3] === 0x43
  ) {
    return { mimeType: "audio/flac", format: "flac", extension: ".flac" };
  }

  // 11. PDF: %PDF (25 50 44 46)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { mimeType: "application/pdf", format: "pdf", extension: ".pdf" };
  }

  // 12. ISO Base Media File Format: AVIF / MP4 / M4A (ftyp box at byte 4-7)
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii").trim();
    const brandUpper = brand.toUpperCase();
    if (brand === "avif" || brand === "avis" || brand === "mif1") {
      return { mimeType: "image/avif", format: "avif", extension: ".avif" };
    }
    if (brandUpper === "M4A" || brandUpper === "M4B") {
      return { mimeType: "audio/mp4", format: "m4a", extension: ".m4a" };
    }
    return { mimeType: "video/mp4", format: "mp4", extension: ".mp4" };
  }

  // 13. WebM / Matroska: 1A 45 DF A3
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return { mimeType: "video/webm", format: "webm", extension: ".webm" };
  }

  // 14. MP3 (ID3v2 / MPEG Layer I-III) & ADTS AAC (Layer bits == 00)
  if (buffer.length >= 3 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return { mimeType: "audio/mpeg", format: "mp3", extension: ".mp3" };
  }
  if (buffer.length >= 2) {
    const b0 = buffer[0];
    const b1 = buffer[1];
    if (b0 === 0xff && b1 !== undefined && (b1 & 0xf0) === 0xf0 && (b1 & 0x06) === 0x00) {
      return { mimeType: "audio/aac", format: "aac", extension: ".aac" };
    }
    if (
      b0 === 0xff &&
      b1 !== undefined &&
      (b1 & 0xe0) === 0xe0 &&
      (b1 & 0x06) !== 0x00
    ) {
      return { mimeType: "audio/mpeg", format: "mp3", extension: ".mp3" };
    }
  }

  // 15. ZIP / DOCX / XLSX / PPTX / ODT: PK\x03\x04
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)
  ) {
    try {
      const zip = new ZipReader(buffer);
      const files = zip.listFiles();
      if (files.length > 0) {
        const mimeEntry = zip.readText("mimetype")?.trim();
        if (mimeEntry === "application/vnd.oasis.opendocument.text") {
          return {
            mimeType: "application/vnd.oasis.opendocument.text",
            format: "odt",
            extension: ".odt",
          };
        }
        if (files.some((f) => f.startsWith("word/"))) {
          return {
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            format: "docx",
            extension: ".docx",
          };
        }
        if (files.some((f) => f.startsWith("xl/"))) {
          return {
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            format: "xlsx",
            extension: ".xlsx",
          };
        }
        if (files.some((f) => f.startsWith("ppt/"))) {
          return {
            mimeType:
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            format: "pptx",
            extension: ".pptx",
          };
        }
        if (files.includes("content.xml") && files.includes("META-INF/manifest.xml")) {
          return {
            mimeType: "application/vnd.oasis.opendocument.text",
            format: "odt",
            extension: ".odt",
          };
        }
      }
    } catch {
      // Fallback to header substring scan for partial/synthetic buffers
    }

    const scanLen = Math.min(buffer.length, 65536);
    const sample = buffer.subarray(0, scanLen).toString("binary");
    if (sample.includes("application/vnd.oasis.opendocument.text")) {
      return {
        mimeType: "application/vnd.oasis.opendocument.text",
        format: "odt",
        extension: ".odt",
      };
    }
    if (sample.includes("word/")) {
      return {
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        format: "docx",
        extension: ".docx",
      };
    }
    if (sample.includes("xl/")) {
      return {
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        format: "xlsx",
        extension: ".xlsx",
      };
    }
    if (sample.includes("ppt/")) {
      return {
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        format: "pptx",
        extension: ".pptx",
      };
    }
    return { mimeType: "application/zip", format: "zip", extension: ".zip" };
  }

  // 16. Microsoft OLE Compound Document (DOC, XLS, PPT legacy)
  if (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 &&
    buffer[5] === 0xb1 &&
    buffer[6] === 0x1a &&
    buffer[7] === 0xe1
  ) {
    const scanLen = Math.min(buffer.length, 65536);
    const sample = buffer.subarray(0, scanLen).toString("binary");
    const sampleUtf16 = buffer.subarray(0, scanLen).toString("utf16le");
    if (
      sample.includes("PowerPoint") ||
      sample.includes("Current User") ||
      sampleUtf16.includes("PowerPoint")
    ) {
      return {
        mimeType: "application/vnd.ms-powerpoint",
        format: "ppt",
        extension: ".ppt",
      };
    }
    if (
      sample.includes("Workbook") ||
      sample.includes("Book") ||
      sample.includes("Microsoft Excel") ||
      sampleUtf16.includes("Workbook")
    ) {
      return {
        mimeType: "application/vnd.ms-excel",
        format: "xls",
        extension: ".xls",
      };
    }
    return {
      mimeType: "application/msword",
      format: "doc",
      extension: ".doc",
    };
  }

  // 17. Text-based detection: RTF, SVG, HTML, XML, JSON, CSV, TSV, YAML, Markdown, TXT
  const sampleLength = Math.min(buffer.length, 8192);
  const sampleBuf = buffer.subarray(0, sampleLength);

  let hasNullByte = false;
  for (let i = 0; i < sampleLength; i++) {
    if (sampleBuf[i] === 0) {
      hasNullByte = true;
      break;
    }
  }

  if (!hasNullByte) {
    const rawText = sampleBuf.toString("utf8");
    const text = rawText.replace(/^\uFEFF/, "").trim();
    const textLower = text.toLowerCase();

    // RTF: {\rtf
    if (text.startsWith("{\\rtf")) {
      return { mimeType: "application/rtf", format: "rtf", extension: ".rtf" };
    }

    // SVG
    if (textLower.startsWith("<svg") || (textLower.startsWith("<?xml") && textLower.includes("<svg"))) {
      return { mimeType: "image/svg+xml", format: "svg", extension: ".svg" };
    }

    // HTML (must precede generic XML '<' check)
    if (
      textLower.startsWith("<!doctype html") ||
      textLower.startsWith("<html") ||
      textLower.startsWith("<head") ||
      textLower.startsWith("<body") ||
      (textLower.startsWith("<!--") && textLower.includes("<html"))
    ) {
      return { mimeType: "text/html", format: "html", extension: ".html" };
    }

    // Generic XML
    if (textLower.startsWith("<?xml") || (/^<[a-zA-Z_][\w:.-]*[\s>]/.test(text) && text.includes(">"))) {
      return { mimeType: "application/xml", format: "xml", extension: ".xml" };
    }

    // JSON
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        JSON.parse(buffer.toString("utf8").replace(/^\uFEFF/, ""));
        return { mimeType: "application/json", format: "json", extension: ".json" };
      } catch {
        // Fallback to text/YAML
      }
    }

    // CSV & TSV (RFC 4180 quote-aware)
    const logicalRecords = splitLogicalCsvLines(text, 4);
    if (logicalRecords.length >= 2) {
      const rec0 = logicalRecords[0];
      const rec1 = logicalRecords[1];
      if (rec0 && rec1) {
        const tabCount0 = countCsvFieldsOutsideQuotes(rec0, "\t");
        const tabCount1 = countCsvFieldsOutsideQuotes(rec1, "\t");
        if (tabCount0 > 0 && tabCount0 === tabCount1) {
          return {
            mimeType: "text/tab-separated-values",
            format: "tsv",
            extension: ".tsv",
          };
        }

        const commaCount0 = countCsvFieldsOutsideQuotes(rec0, ",");
        const commaCount1 = countCsvFieldsOutsideQuotes(rec1, ",");
        if (commaCount0 > 0 && commaCount0 === commaCount1) {
          return { mimeType: "text/csv", format: "csv", extension: ".csv" };
        }

        const semiCount0 = countCsvFieldsOutsideQuotes(rec0, ";");
        const semiCount1 = countCsvFieldsOutsideQuotes(rec1, ";");
        if (semiCount0 > 0 && semiCount0 === semiCount1) {
          return { mimeType: "text/csv", format: "csv", extension: ".csv" };
        }
      }
    }

    // YAML
    if (looksLikeYaml(text)) {
      return { mimeType: "application/x-yaml", format: "yaml", extension: ".yaml" };
    }

    // Markdown
    if (
      text.startsWith("# ") ||
      text.startsWith("## ") ||
      text.startsWith("### ") ||
      text.includes("\n# ") ||
      text.includes("\n## ") ||
      (text.includes("[") && text.includes("](") && text.includes(")"))
    ) {
      return { mimeType: "text/markdown", format: "md", extension: ".md" };
    }

    // Plain text fallback
    if (text.length > 0) {
      return { mimeType: "text/plain", format: "txt", extension: ".txt" };
    }
  }

  return null;
}

function normalizeFormatName(fmt: string): string {
  const clean = fmt
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "")
    .replace(/\.+$/, "")
    .trim();
  if (clean === "jpeg") return "jpg";
  if (clean === "tiff") return "tif";
  if (clean === "yml") return "yaml";
  if (clean === "htm") return "html";
  return clean;
}

const TEXTUAL_FORMATS = new Set(["txt", "md", "csv", "tsv", "yaml", "html", "xml", "json"]);

export function verifyFileMime(
  buffer: Buffer,
  declaredExtensionOrFormat: string
): MimeVerificationResult {
  const detected = detectMimeType(buffer);

  if (!detected) {
    return {
      valid: false,
      detectedMime: null,
      detectedFormat: null,
      error: "Format konten file tidak dikenali atau format tidak didukung.",
    };
  }

  if (!declaredExtensionOrFormat || typeof declaredExtensionOrFormat !== "string") {
    return {
      valid: false,
      detectedMime: detected.mimeType,
      detectedFormat: detected.format,
      error: "Format atau ekstensi yang dinyatakan tidak valid.",
    };
  }

  const normalizedDeclared = normalizeFormatName(declaredExtensionOrFormat);
  const normalizedDetected = normalizeFormatName(detected.format);

  const declaredClean = declaredExtensionOrFormat.trim().toLowerCase();
  const declaredBaseMime = declaredClean.split(";")[0]?.trim() ?? declaredClean;
  const detectedMimeLower = detected.mimeType.toLowerCase();

  const isEquivalent =
    normalizedDeclared === normalizedDetected ||
    declaredClean === detectedMimeLower ||
    declaredBaseMime === detectedMimeLower ||
    (declaredBaseMime === "image/jpg" && detectedMimeLower === "image/jpeg") ||
    (declaredBaseMime === "image/vnd.microsoft.icon" && detectedMimeLower === "image/x-icon") ||
    (declaredBaseMime === "audio/mp3" && detectedMimeLower === "audio/mpeg") ||
    (declaredBaseMime === "audio/x-m4a" && detectedMimeLower === "audio/mp4") ||
    (declaredBaseMime === "audio/x-wav" && detectedMimeLower === "audio/wav") ||
    (declaredBaseMime === "text/yaml" && detectedMimeLower === "application/x-yaml") ||
    (declaredBaseMime === "text/xml" && detectedMimeLower === "application/xml") ||
    (declaredBaseMime === "text/rtf" && detectedMimeLower === "application/rtf") ||
    (normalizedDeclared === "m4a" && normalizedDetected === "mp4") ||
    (normalizedDeclared === "mp4" && normalizedDetected === "m4a") ||
    ((normalizedDeclared === "txt" || declaredBaseMime === "text/plain") &&
      TEXTUAL_FORMATS.has(normalizedDetected)) ||
    (normalizedDeclared === "md" && normalizedDetected === "txt") ||
    (normalizedDeclared === "yaml" && normalizedDetected === "txt") ||
    (normalizedDeclared === "csv" && (normalizedDetected === "tsv" || normalizedDetected === "txt")) ||
    (normalizedDeclared === "tsv" && (normalizedDetected === "csv" || normalizedDetected === "txt")) ||
    ((normalizedDeclared === "zip" ||
      declaredBaseMime === "application/zip" ||
      declaredBaseMime === "application/x-zip-compressed") &&
      ["docx", "xlsx", "pptx", "odt", "zip"].includes(normalizedDetected));

  if (!isEquivalent) {
    return {
      valid: false,
      detectedMime: detected.mimeType,
      detectedFormat: detected.format,
      error: `Format berkas yang dideklarasikan (${declaredExtensionOrFormat}) tidak sesuai dengan signature konten biner asli (${detected.format} / ${detected.mimeType}).`,
    };
  }

  return {
    valid: true,
    detectedMime: detected.mimeType,
    detectedFormat: detected.format,
  };
}
