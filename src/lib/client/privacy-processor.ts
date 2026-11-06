// File: src/lib/client/privacy-processor.ts

export interface ClientProcessResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

const IMAGE_MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Checks whether a given conversion pair can be executed 100% inside the browser
 * without transmitting any bytes to the server.
 */
export function canProcessClientSide(
  sourceFormat: string,
  targetFormat: string
): boolean {
  const src = sourceFormat.toLowerCase().replace(/^\.+/, "");
  const tgt = targetFormat.toLowerCase().replace(/^\.+/, "");

  const isImageSrc = ["jpg", "jpeg", "png", "webp"].includes(src);
  const isImageTgt = ["jpg", "jpeg", "png", "webp"].includes(tgt);
  if (isImageSrc && isImageTgt) return true;

  if (["json", "csv", "tsv"].includes(src) && ["json", "csv", "tsv", "txt"].includes(tgt)) {
    return true;
  }

  if (src === "txt" && tgt === "json") {
    return true;
  }

  return false;
}

/**
 * Checks whether a file format supports 100% browser-local compression in Privacy Mode.
 */
export function canCompressClientSide(format: string): boolean {
  const clean = format.toLowerCase().replace(/^\.+/, "");
  return [
    "jpg",
    "jpeg",
    "png",
    "webp",
    "svg",
    "json",
    "csv",
    "tsv",
    "txt",
    "md",
    "html",
    "xml",
  ].includes(clean);
}

/**
 * Converts raster images (JPG, PNG, WebP) using the browser HTML5 Canvas API.
 */
export async function processImageClientSide(
  file: File,
  targetFormat: string,
  quality = 0.92
): Promise<ClientProcessResult> {
  const tgt = targetFormat.toLowerCase().replace(/^\.+/, "");
  const targetMime = IMAGE_MIME_TYPES[tgt] || "image/png";

  const imageBitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Gagal menginisialisasi canvas rendering context.");
    }

    if (tgt === "jpg" || tgt === "jpeg") {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(imageBitmap, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error("Gagal menghasilkan blob gambar di browser."));
        },
        targetMime,
        quality
      );
    });

    const dotIdx = file.name.lastIndexOf(".");
    const baseName = dotIdx > 0 ? file.name.substring(0, dotIdx) : file.name;
    const outExt = tgt === "jpeg" ? "jpg" : tgt;
    const outputFilename = `${baseName}.${outExt}`;

    return {
      blob,
      filename: outputFilename,
      mimeType: targetMime,
      sizeBytes: blob.size,
    };
  } finally {
    if (typeof imageBitmap.close === "function") {
      imageBitmap.close();
    }
  }
}

/**
 * Compresses raster images or text/data files 100% locally inside the browser.
 */
export async function compressClientSide(
  file: File,
  level: "low" | "recommended" | "extreme" = "recommended"
): Promise<ClientProcessResult> {
  const dotIdx = file.name.lastIndexOf(".");
  const baseName = dotIdx > 0 ? file.name.substring(0, dotIdx) : file.name;
  const ext = dotIdx > 0 ? file.name.substring(dotIdx + 1).toLowerCase() : "";
  const outputFilename = `${baseName}_compressed.${ext || "bin"}`;

  if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
    const qualityMap = {
      low: 0.86,
      recommended: 0.72,
      extreme: 0.46,
    };
    const imageBitmap = await createImageBitmap(file);
    try {
      let targetW = imageBitmap.width;
      let targetH = imageBitmap.height;
      if (level === "extreme" && Math.max(targetW, targetH) > 2200) {
        const scale = 2200 / Math.max(targetW, targetH);
        targetW = Math.max(1, Math.round(targetW * scale));
        targetH = Math.max(1, Math.round(targetH * scale));
      } else if (ext === "png" && level !== "low" && Math.max(targetW, targetH) > 2560) {
        const scale = 2560 / Math.max(targetW, targetH);
        targetW = Math.max(1, Math.round(targetW * scale));
        targetH = Math.max(1, Math.round(targetH * scale));
      }

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Gagal menginisialisasi canvas rendering context.");
      }

      if (ext === "jpg" || ext === "jpeg") {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, targetW, targetH);
      }

      ctx.drawImage(imageBitmap, 0, 0, targetW, targetH);

      const mime = IMAGE_MIME_TYPES[ext] || "image/jpeg";
      const candidateBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error("Gagal mengompresi gambar di browser."));
          },
          mime,
          qualityMap[level]
        );
      });

      const finalBlob = candidateBlob.size < file.size ? candidateBlob : file;
      return {
        blob: finalBlob,
        filename: outputFilename,
        mimeType: mime,
        sizeBytes: finalBlob.size,
      };
    } finally {
      if (typeof imageBitmap.close === "function") {
        imageBitmap.close();
      }
    }
  }

  const rawText = await file.text();
  let minified = rawText;
  let mimeType = file.type || "text/plain";

  if (ext === "json") {
    mimeType = "application/json";
    minified = JSON.stringify(JSON.parse(rawText));
  } else if (ext === "svg" || ext === "xml" || ext === "html") {
    mimeType = ext === "svg" ? "image/svg+xml" : ext === "xml" ? "application/xml" : "text/html";
    minified = rawText
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/>\s+</g, "><")
      .trim();
  } else {
    minified = rawText
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .join("\n")
      .trim();
  }

  const candidateBlob = new Blob([minified], { type: `${mimeType};charset=utf-8` });
  const finalBlob = candidateBlob.size < file.size ? candidateBlob : file;

  return {
    blob: finalBlob,
    filename: outputFilename,
    mimeType,
    sizeBytes: finalBlob.size,
  };
}

/**
 * RFC 4180 quote-aware CSV/TSV parser into an array of object records.
 */
function parseDelimitedText(
  text: string,
  delimiter: string
): Array<Record<string, string>> {
  const cleanText = text.replace(/^\uFEFF/, "");
  const matrix: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (cleanText[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      currentRow.push(currentField.trim());
      currentField = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && cleanText[i + 1] === "\n") i++;
      currentRow.push(currentField.trim());
      currentField = "";
      if (currentRow.some((c) => c.length > 0)) {
        matrix.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += ch;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((c) => c.length > 0)) {
      matrix.push(currentRow);
    }
  }

  if (matrix.length === 0) return [];

  const headers = matrix[0] || [];
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < matrix.length; i++) {
    const values = matrix[i] || [];
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const key = h || `col_${idx + 1}`;
      row[key] = values[idx] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

/**
 * Converts array of records or raw JSON into delimited text (CSV or TSV).
 */
function recordsToDelimited(data: unknown, delimiter: string): string {
  const items = Array.isArray(data) ? data : [data];
  if (items.length === 0) return "";

  const allKeys = new Set<string>();
  items.forEach((item) => {
    if (item && typeof item === "object") {
      Object.keys(item).forEach((k) => allKeys.add(k));
    }
  });

  const keys = Array.from(allKeys);
  const headerLine = keys.map((k) => `"${k.replace(/"/g, '""')}"`).join(delimiter);

  const rows = items.map((item) => {
    if (!item || typeof item !== "object") return `"${String(item)}"`;
    return keys
      .map((k) => {
        const val = (item as Record<string, unknown>)[k] ?? "";
        const str = typeof val === "object" ? JSON.stringify(val) : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      })
      .join(delimiter);
  });

  return [headerLine, ...rows].join("\n");
}

/**
 * Converts text/data files (JSON, CSV, TSV, TXT) entirely in the browser.
 */
export async function processDataClientSide(
  file: File,
  targetFormat: string
): Promise<ClientProcessResult> {
  const text = await file.text();
  const srcExt = file.name.split(".").pop()?.toLowerCase() || "";
  const tgt = targetFormat.toLowerCase().replace(/^\.+/, "");

  let outputText = "";
  let mimeType = "text/plain";

  if (tgt === "json") {
    mimeType = "application/json";
    if (srcExt === "csv") {
      const records = parseDelimitedText(text, ",");
      outputText = JSON.stringify(records, null, 2);
    } else if (srcExt === "tsv") {
      const records = parseDelimitedText(text, "\t");
      outputText = JSON.stringify(records, null, 2);
    } else {
      outputText = JSON.stringify({ content: text }, null, 2);
    }
  } else if (tgt === "csv") {
    mimeType = "text/csv";
    if (srcExt === "json") {
      const parsed = JSON.parse(text);
      outputText = recordsToDelimited(parsed, ",");
    } else if (srcExt === "tsv") {
      const records = parseDelimitedText(text, "\t");
      outputText = recordsToDelimited(records, ",");
    } else {
      throw new Error("Konversi berkas teks bebas ke CSV membutuhkan pemrosesan struktur.");
    }
  } else if (tgt === "tsv") {
    mimeType = "text/tab-separated-values";
    if (srcExt === "json") {
      const parsed = JSON.parse(text);
      outputText = recordsToDelimited(parsed, "\t");
    } else if (srcExt === "csv") {
      const records = parseDelimitedText(text, ",");
      outputText = recordsToDelimited(records, "\t");
    } else {
      throw new Error("Konversi berkas teks bebas ke TSV membutuhkan pemrosesan struktur.");
    }
  } else {
    if (srcExt === "csv") {
      const records = parseDelimitedText(text, ",");
      outputText = recordsToDelimited(records, "\t");
    } else if (srcExt === "json") {
      outputText = JSON.stringify(JSON.parse(text), null, 2);
    } else {
      outputText = text;
    }
  }

  const blob = new Blob([outputText], { type: `${mimeType};charset=utf-8` });
  const dotIdx = file.name.lastIndexOf(".");
  const baseName = dotIdx > 0 ? file.name.substring(0, dotIdx) : file.name;
  const outputFilename = `${baseName}.${tgt}`;

  return {
    blob,
    filename: outputFilename,
    mimeType,
    sizeBytes: blob.size,
  };
}
