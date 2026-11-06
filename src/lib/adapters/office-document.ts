// File: src/lib/adapters/office-document.ts

import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  ConversionResult,
  ConversionTarget,
  FileCategory,
  IConversionAdapter,
} from "./types";
import {
  DocumentSection,
  extractPdfText,
  htmlToSections,
  isLegacyOle2Buffer,
  jsonToRows,
  LEGACY_OFFICE_BINARY_ERROR,
  markdownToSections,
  parseDelimitedRows,
  parseDocx,
  parseOdt,
  parsePptx,
  parseRtf,
  parseXlsx,
  plainTextToSections,
  preparePresentationSlidesForPdf,
  presentationToMarkdown,
  presentationToPdf,
  rowsToXlsx,
  sectionsToDocx,
  spreadsheetToCsv,
  spreadsheetToJson,
  spreadsheetToPdf,
  textToPdf,
  wordToMarkdown,
  wordToPdf,
} from "../document/office-parser";

const execFileAsync = promisify(execFile);

const TARGET_FORMAT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  txt: "text/plain",
  html: "text/html",
  md: "text/markdown",
};

const TARGET_FORMAT_LABELS: Record<string, string> = {
  pdf: "PDF (Portable Document Format)",
  docx: "DOCX (Microsoft Word Document)",
  pptx: "PPTX (Microsoft PowerPoint)",
  xlsx: "XLSX (Microsoft Excel)",
  csv: "CSV (Comma-Separated Values)",
  tsv: "TSV (Tab-Separated Values)",
  json: "JSON (JavaScript Object Notation)",
  txt: "TXT (Plain Text Document)",
  html: "HTML (Web Page)",
  md: "MD (Markdown Document)",
};

export class UniversalOfficeDocumentAdapter implements IConversionAdapter {
  public readonly id: string = "universal-office-document";
  public readonly name: string = "Universal Office & Hybrid Document Engine";
  public readonly category: FileCategory = "document";

  private supportedSources: string[] = [
    "pptx",
    "ppt",
    "docx",
    "doc",
    "xlsx",
    "xls",
    "pdf",
    "txt",
    "md",
    "html",
    "csv",
    "tsv",
    "json",
    "odt",
    "rtf",
  ];

  private libreOfficeBinary: string | null = null;
  private hasCheckedLibreOffice: boolean = false;

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public getSetupInstructions(): string {
    return "Universal Office & Hybrid Document Engine siap digunakan secara lokal untuk OpenXML (.docx, .pptx, .xlsx), ODT, RTF, PDF, HTML, Markdown, CSV/TSV, dan JSON.";
  }

  public getSupportedSources(): string[] {
    return [...this.supportedSources];
  }

  public async getSupportedTargets(sourceFormat: string): Promise<ConversionTarget[]> {
    const cleanSource = sourceFormat.toLowerCase().replace(/^\.+/, "");
    const targets: ConversionTarget[] = [];

    const isLegacyBinary =
      cleanSource === "doc" || cleanSource === "ppt" || cleanSource === "xls";
    const soffice = isLegacyBinary ? await this.detectLibreOffice() : null;

    let possibleTargets: string[] = [];

    if (cleanSource === "pptx" || cleanSource === "ppt") {
      possibleTargets = ["pdf", "txt", "html", "md"];
    } else if (cleanSource === "docx" || cleanSource === "doc") {
      possibleTargets = ["pdf", "txt", "html", "md"];
    } else if (cleanSource === "odt" || cleanSource === "rtf") {
      possibleTargets = ["pdf", "docx", "txt", "html", "md"];
    } else if (cleanSource === "xlsx" || cleanSource === "xls") {
      possibleTargets = ["pdf", "csv", "tsv", "json", "html", "txt"];
    } else if (cleanSource === "csv" || cleanSource === "tsv" || cleanSource === "json") {
      possibleTargets = ["pdf", "xlsx", "csv", "tsv", "json"];
    } else if (cleanSource === "txt" || cleanSource === "md" || cleanSource === "html") {
      possibleTargets = ["pdf", "docx", "txt", "md", "html"];
    } else if (cleanSource === "pdf") {
      possibleTargets = ["txt", "html", "md"];
    }

    possibleTargets = possibleTargets.filter((t) => t !== cleanSource);

    for (const target of possibleTargets) {
      const targetAvailable = isLegacyBinary ? Boolean(soffice) : true;
      targets.push({
        targetFormat: target,
        label: TARGET_FORMAT_LABELS[target] || target.toUpperCase(),
        mimeType: TARGET_FORMAT_MIME[target] || "application/octet-stream",
        adapterId: this.id,
        isAvailable: targetAvailable,
        statusReason: targetAvailable ? undefined : LEGACY_OFFICE_BINARY_ERROR,
      });
    }

    return targets;
  }

  private async detectLibreOffice(): Promise<string | null> {
    if (this.hasCheckedLibreOffice) {
      return this.libreOfficeBinary;
    }

    this.hasCheckedLibreOffice = true;
    try {
      const probeCmd = process.platform === "win32" ? "where" : "which";
      const { stdout } = await execFileAsync(probeCmd, ["soffice"]);
      if (stdout && stdout.trim().length > 0) {
        this.libreOfficeBinary = stdout.trim().split(/\r?\n/)[0] || "soffice";
      }
    } catch {
      this.libreOfficeBinary = null;
    }

    return this.libreOfficeBinary;
  }

  public async convert(
    inputPath: string,
    outputPath: string,
    sourceFormat: string,
    targetFormat: string
  ): Promise<ConversionResult> {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Berkas sumber tidak ditemukan pada: ${inputPath}`);
    }

    const startTime = Date.now();
    const cleanSource = sourceFormat.toLowerCase().replace(/^\.+/, "");
    const cleanTarget = targetFormat.toLowerCase().replace(/^\.+/, "");
    const fileBaseName = path.basename(inputPath, path.extname(inputPath));

    const soffice = await this.detectLibreOffice();
    if (soffice) {
      try {
        const outDir = path.dirname(outputPath);
        await execFileAsync(soffice, [
          "--headless",
          "--convert-to",
          cleanTarget,
          "--outdir",
          outDir,
          inputPath,
        ]);

        const expectedFile = path.join(outDir, `${fileBaseName}.${cleanTarget}`);
        if (fs.existsSync(expectedFile)) {
          if (expectedFile !== outputPath) {
            fs.copyFileSync(expectedFile, outputPath);
            try {
              fs.unlinkSync(expectedFile);
            } catch {
              // Ignore cleanup error
            }
          }

          const stat = fs.statSync(outputPath);
          return {
            outputBytes: stat.size,
            mimeType: TARGET_FORMAT_MIME[cleanTarget] || "application/octet-stream",
            outputPath,
            durationMs: Date.now() - startTime,
          };
        }
      } catch {
        // Fallback to native TypeScript document engine
      }
    }

    const inputBuffer = fs.readFileSync(inputPath);

    if (
      isLegacyOle2Buffer(inputBuffer) ||
      cleanSource === "doc" ||
      cleanSource === "ppt" ||
      cleanSource === "xls"
    ) {
      throw new Error(LEGACY_OFFICE_BINARY_ERROR);
    }

    let outputBuffer: Buffer;

    if (cleanSource === "pptx") {
      const slides = parsePptx(inputBuffer);
      if (cleanTarget === "pdf") {
        const preparedSlides = await preparePresentationSlidesForPdf(slides);
        outputBuffer = presentationToPdf(preparedSlides, fileBaseName);
      } else if (cleanTarget === "md") {
        outputBuffer = Buffer.from(presentationToMarkdown(slides), "utf8");
      } else if (cleanTarget === "txt") {
        const plain = slides
          .map((s, idx) =>
            [`Slide ${idx + 1}: ${s.title}`, ...s.bullets.map((b) => `- ${b}`)].join("\n")
          )
          .join("\n\n");
        outputBuffer = Buffer.from(plain, "utf8");
      } else if (cleanTarget === "html") {
        const body = slides
          .map(
            (s) =>
              `<section><h2>${escapeHtml(s.title)}</h2><ul>${s.bullets
                .map((b) => `<li>${escapeHtml(b)}</li>`)
                .join("")}</ul></section>`
          )
          .join("\n");
        outputBuffer = Buffer.from(
          `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(
            fileBaseName
          )}</title></head><body><h1>${escapeHtml(fileBaseName)}</h1>${body}</body></html>`,
          "utf8"
        );
      } else {
        throw new Error(`Konversi dari ${cleanSource} ke ${cleanTarget} belum didukung.`);
      }
    } else if (
      cleanSource === "docx" ||
      cleanSource === "odt" ||
      cleanSource === "rtf"
    ) {
      const sections: DocumentSection[] =
        cleanSource === "odt"
          ? parseOdt(inputBuffer)
          : cleanSource === "rtf"
          ? parseRtf(inputBuffer)
          : parseDocx(inputBuffer);

      outputBuffer = renderSectionsToTarget(sections, cleanTarget, fileBaseName, cleanSource);
    } else if (cleanSource === "xlsx") {
      const spreadsheet = parseXlsx(inputBuffer);
      if (cleanTarget === "pdf") {
        outputBuffer = spreadsheetToPdf(spreadsheet, fileBaseName);
      } else if (cleanTarget === "csv") {
        outputBuffer = Buffer.from(spreadsheetToCsv(spreadsheet.rows, ","), "utf8");
      } else if (cleanTarget === "tsv") {
        outputBuffer = Buffer.from(spreadsheetToCsv(spreadsheet.rows, "\t"), "utf8");
      } else if (cleanTarget === "json") {
        outputBuffer = Buffer.from(spreadsheetToJson(spreadsheet.rows), "utf8");
      } else if (cleanTarget === "html") {
        outputBuffer = Buffer.from(renderTableHtml(spreadsheet.rows, fileBaseName), "utf8");
      } else if (cleanTarget === "txt") {
        outputBuffer = Buffer.from(spreadsheetToCsv(spreadsheet.rows, "\t"), "utf8");
      } else {
        throw new Error(`Konversi dari ${cleanSource} ke ${cleanTarget} belum didukung.`);
      }
    } else if (cleanSource === "csv" || cleanSource === "tsv") {
      const text = inputBuffer.toString("utf8");
      const delimiter = cleanSource === "tsv" ? "\t" : ",";
      const rows = parseDelimitedRows(text, delimiter);

      if (cleanTarget === "pdf") {
        outputBuffer = spreadsheetToPdf(
          { sheetName: fileBaseName, rows },
          fileBaseName
        );
      } else if (cleanTarget === "xlsx") {
        outputBuffer = rowsToXlsx(rows, fileBaseName);
      } else if (cleanTarget === "json") {
        outputBuffer = Buffer.from(spreadsheetToJson(rows), "utf8");
      } else if (cleanTarget === "csv") {
        outputBuffer = Buffer.from(spreadsheetToCsv(rows, ","), "utf8");
      } else if (cleanTarget === "tsv") {
        outputBuffer = Buffer.from(spreadsheetToCsv(rows, "\t"), "utf8");
      } else if (cleanTarget === "html") {
        outputBuffer = Buffer.from(renderTableHtml(rows, fileBaseName), "utf8");
      } else {
        throw new Error(`Konversi dari ${cleanSource} ke ${cleanTarget} belum didukung.`);
      }
    } else if (cleanSource === "json") {
      const text = inputBuffer.toString("utf8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        throw new Error(`Berkas JSON tidak valid: ${(err as Error).message}`);
      }

      const rows = jsonToRows(parsed);
      if (cleanTarget === "pdf") {
        if (Array.isArray(parsed) && rows.length > 1) {
          outputBuffer = spreadsheetToPdf(
            { sheetName: fileBaseName, rows },
            fileBaseName
          );
        } else {
          outputBuffer = textToPdf(JSON.stringify(parsed, null, 2), fileBaseName);
        }
      } else if (cleanTarget === "xlsx") {
        outputBuffer = rowsToXlsx(rows, fileBaseName);
      } else if (cleanTarget === "csv") {
        outputBuffer = Buffer.from(spreadsheetToCsv(rows, ","), "utf8");
      } else if (cleanTarget === "tsv") {
        outputBuffer = Buffer.from(spreadsheetToCsv(rows, "\t"), "utf8");
      } else {
        throw new Error(`Konversi dari ${cleanSource} ke ${cleanTarget} belum didukung.`);
      }
    } else if (cleanSource === "txt" || cleanSource === "md" || cleanSource === "html") {
      const text = inputBuffer.toString("utf8");
      const sections: DocumentSection[] =
        cleanSource === "html"
          ? htmlToSections(text)
          : cleanSource === "md"
          ? markdownToSections(text)
          : plainTextToSections(text);

      if (cleanTarget === "pdf" && cleanSource === "txt") {
        outputBuffer = textToPdf(text, fileBaseName);
      } else {
        outputBuffer = renderSectionsToTarget(sections, cleanTarget, fileBaseName, cleanSource);
      }
    } else if (cleanSource === "pdf") {
      const extracted = extractPdfText(inputBuffer);
      if (!extracted) {
        throw new Error(
          "Dokumen PDF ini tidak mengandung lapisan teks yang dapat diekstrak (kemungkinan PDF hasil pindaian gambar tanpa OCR)."
        );
      }

      if (cleanTarget === "txt") {
        outputBuffer = Buffer.from(extracted, "utf8");
      } else if (cleanTarget === "md") {
        outputBuffer = Buffer.from(`# ${fileBaseName}\n\n${extracted}`, "utf8");
      } else if (cleanTarget === "html") {
        const paragraphsHtml = extracted
          .split(/\n+/)
          .filter((l) => l.trim().length > 0)
          .map((l) => `<p>${escapeHtml(l)}</p>`)
          .join("\n");
        outputBuffer = Buffer.from(
          `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(
            fileBaseName
          )}</title></head><body><article><h1>${escapeHtml(
            fileBaseName
          )}</h1>\n${paragraphsHtml}\n</article></body></html>`,
          "utf8"
        );
      } else {
        throw new Error(`Konversi dari ${cleanSource} ke ${cleanTarget} belum didukung.`);
      }
    } else {
      throw new Error(`Format sumber ${cleanSource} belum didukung.`);
    }

    fs.writeFileSync(outputPath, outputBuffer);
    const stat = fs.statSync(outputPath);

    return {
      outputBytes: stat.size,
      mimeType: TARGET_FORMAT_MIME[cleanTarget] || "application/octet-stream",
      outputPath,
      durationMs: Date.now() - startTime,
    };
  }
}

function renderSectionsToTarget(
  sections: DocumentSection[],
  cleanTarget: string,
  title: string,
  cleanSource: string
): Buffer {
  if (cleanTarget === "pdf") {
    return wordToPdf(sections, title);
  }
  if (cleanTarget === "docx") {
    return sectionsToDocx(sections, title);
  }
  if (cleanTarget === "md") {
    return Buffer.from(wordToMarkdown(sections), "utf8");
  }
  if (cleanTarget === "txt") {
    const plain = sections
      .map((s) => (s.type === "bullet" ? `- ${s.text}` : s.text))
      .join("\n\n");
    return Buffer.from(plain, "utf8");
  }
  if (cleanTarget === "html") {
    const body = sections
      .map((s) => {
        if (s.type === "heading") {
          const lvl = Math.min(6, Math.max(1, s.level || 1));
          return `<h${lvl}>${escapeHtml(s.text)}</h${lvl}>`;
        }
        if (s.type === "bullet") {
          return `<li>${escapeHtml(s.text)}</li>`;
        }
        return `<p>${escapeHtml(s.text)}</p>`;
      })
      .join("\n")
      .replace(/(?:<li>.*?<\/li>\n?)+/gs, (match) => `<ul>\n${match}</ul>\n`);

    return Buffer.from(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(
        title
      )}</title></head><body>${body}</body></html>`,
      "utf8"
    );
  }

  throw new Error(`Konversi dari ${cleanSource} ke ${cleanTarget} belum didukung.`);
}

function renderTableHtml(rows: string[][], title: string): string {
  const rowsHtml = rows
    .map(
      (r, idx) =>
        `<tr>${r
          .map((c) =>
            idx === 0 ? `<th>${escapeHtml(c)}</th>` : `<td>${escapeHtml(c)}</td>`
          )
          .join("")}</tr>`
    )
    .join("\n");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title
  )}</title></head><body><h1>${escapeHtml(
    title
  )}</h1><table border="1">${rowsHtml}</table></body></html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
