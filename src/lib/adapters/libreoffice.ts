// File: src/lib/adapters/libreoffice.ts

import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import {
  ConversionResult,
  ConversionTarget,
  FileCategory,
  IConversionAdapter,
} from "./types";

const execFileAsync = promisify(execFile);

const TARGET_FORMAT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  rtf: "application/rtf",
  txt: "text/plain",
  html: "text/html",
};

const TARGET_FORMAT_LABELS: Record<string, string> = {
  pdf: "PDF (Portable Document Format)",
  docx: "DOCX (Microsoft Word Document)",
  odt: "ODT (OpenDocument Text)",
  rtf: "RTF (Rich Text Format)",
  txt: "TXT (Plain Text Document)",
  html: "HTML (Web Page)",
};

export class LibreOfficeDocumentAdapter implements IConversionAdapter {
  public readonly id: string = "libreoffice-document";
  public readonly name: string = "LibreOffice Headless Document Converter";
  public readonly category: FileCategory = "document";

  private supportedSources: string[] = [
    "docx",
    "doc",
    "pptx",
    "ppt",
    "xlsx",
    "xls",
    "odt",
    "rtf",
    "txt",
    "html",
    "pdf",
  ];
  private binaryPath: string | null = null;
  private hasCheckedAvailability: boolean = false;
  private isAvailableCache: boolean = false;

  public async isAvailable(): Promise<boolean> {
    if (this.hasCheckedAvailability) {
      return this.isAvailableCache;
    }

    try {
      const probeCmd = process.platform === "win32" ? "where" : "which";
      const { stdout } = await execFileAsync(probeCmd, ["soffice"]);
      if (stdout && stdout.trim().length > 0) {
        this.binaryPath = stdout.trim().split(/\r?\n/)[0] || "soffice";
        this.isAvailableCache = true;
      } else {
        this.isAvailableCache = false;
      }
    } catch {
      this.isAvailableCache = false;
    }

    this.hasCheckedAvailability = true;
    return this.isAvailableCache;
  }

  public getSetupInstructions(): string {
    return "LibreOffice belum terpasang atau executable 'soffice' tidak ditemukan dalam PATH sistem. Format biner lawas (.doc, .ppt, .xls) membutuhkan LibreOffice Headless; silakan unduh dari https://www.libreoffice.org atau simpan ulang dokumen sebagai .docx, .pptx, atau .xlsx.";
  }

  public getSupportedSources(): string[] {
    return [...this.supportedSources];
  }

  public async getSupportedTargets(sourceFormat: string): Promise<ConversionTarget[]> {
    const isAvail = await this.isAvailable();
    const cleanSource = sourceFormat.toLowerCase().replace(/^\.+/, "");
    const targets: ConversionTarget[] = [];

    const possibleTargets = ["pdf", "docx", "odt", "rtf", "txt", "html"].filter(
      (t) => t !== cleanSource
    );

    for (const target of possibleTargets) {
      targets.push({
        targetFormat: target,
        label: TARGET_FORMAT_LABELS[target] || target.toUpperCase(),
        mimeType: TARGET_FORMAT_MIME[target] || "application/octet-stream",
        adapterId: this.id,
        isAvailable: isAvail,
        statusReason: isAvail ? undefined : this.getSetupInstructions(),
      });
    }

    return targets;
  }

  public async convert(
    inputPath: string,
    outputPath: string,
    _sourceFormat: string,
    targetFormat: string
  ): Promise<ConversionResult> {
    const cleanTarget = targetFormat.toLowerCase().replace(/^\.+/, "");
    if (!Object.prototype.hasOwnProperty.call(TARGET_FORMAT_MIME, cleanTarget)) {
      throw new Error(`Format target dokumen tidak diizinkan: ${cleanTarget}`);
    }

    const isAvail = await this.isAvailable();
    if (!isAvail) {
      throw new Error(this.getSetupInstructions());
    }

    if (!fs.existsSync(inputPath)) {
      throw new Error(`File sumber tidak ditemukan pada: ${inputPath}`);
    }
    const startTime = Date.now();
    const binary = this.binaryPath || "soffice";
    const outDir = path.dirname(outputPath);
    const fileBaseName = path.basename(inputPath, path.extname(inputPath));

    await execFileAsync(
      binary,
      [
        "--headless",
        "--convert-to",
        cleanTarget,
        "--outdir",
        outDir,
        inputPath,
      ],
      {
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    const expectedFile = path.join(outDir, `${fileBaseName}.${cleanTarget}`);
    if (fs.existsSync(expectedFile) && expectedFile !== outputPath) {
      fs.copyFileSync(expectedFile, outputPath);
      try {
        fs.unlinkSync(expectedFile);
      } catch {
        // Ignore cleanup failure
      }
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error(`Gagal menghasilkan file konversi dokumen ke: ${outputPath}`);
    }

    const stat = fs.statSync(outputPath);
    const durationMs = Date.now() - startTime;
    const mimeType = TARGET_FORMAT_MIME[cleanTarget] || "application/octet-stream";

    return {
      outputBytes: stat.size,
      mimeType,
      outputPath,
      durationMs,
    };
  }
}
