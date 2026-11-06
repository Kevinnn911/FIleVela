// File: src/lib/document/office-parser.ts

import zlib from "zlib";
import sharp from "sharp";
import { SimplePdfDocument } from "./pdf-builder";
import { ZipReader } from "./zip-reader";
import { ZipWriter } from "./zip-writer";

export interface PresentationParagraph {
  text: string;
  align?: "left" | "center" | "right";
  isBold?: boolean;
  fontSize?: number;
  isBullet?: boolean;
  color?: [number, number, number];
}

export interface PresentationSlide {
  title: string;
  bullets: string[];
  paragraphs?: PresentationParagraph[];
  backgroundImage?: Buffer;
  backgroundColor?: [number, number, number];
  isWidescreen?: boolean;
  slideWidth?: number;
  slideHeight?: number;
}

export interface DocumentSection {
  type: "heading" | "paragraph" | "bullet";
  level?: number;
  text: string;
}

export interface SpreadsheetData {
  sheetName: string;
  rows: string[][];
}

export const LEGACY_OFFICE_BINARY_ERROR =
  "Format biner lawas Microsoft Office 97-2003 (.doc/.ppt/.xls) membutuhkan LibreOffice Headless di server. Silakan simpan ulang berkas sebagai .docx, .pptx, atau .xlsx terlebih dahulu.";

export function isLegacyOle2Buffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 &&
    buffer[5] === 0xb1 &&
    buffer[6] === 0x1a &&
    buffer[7] === 0xe1
  );
}

export function decodeXmlEntities(str: string): string {
  if (!str || !str.includes("&")) return str;
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
      const cp = parseInt(hex, 16);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const cp = parseInt(dec, 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// -------------------------------------------------------------
// PPTX / Presentation Extractor & Converter
// -------------------------------------------------------------

export function parsePptx(buffer: Buffer): PresentationSlide[] {
  if (isLegacyOle2Buffer(buffer)) {
    throw new Error(LEGACY_OFFICE_BINARY_ERROR);
  }

  const zip = new ZipReader(buffer);
  const fileList = zip.listFiles();

  const slideFiles = fileList
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
    .sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    });

  if (slideFiles.length === 0) {
    throw new Error(
      "Arsip PPTX tidak valid atau tidak memiliki struktur slide OpenXML (ppt/slides/slide*.xml)."
    );
  }

  let isWidescreen = true;
  let slideWidth = 960;
  let slideHeight = 540;

  const presXml = zip.readText("ppt/presentation.xml");
  if (presXml) {
    const sldSzMatch = presXml.match(/<p:sldSz\s+[^>]*cx="(\d+)"[^>]*cy="(\d+)"/i);
    if (sldSzMatch && sldSzMatch[1] && sldSzMatch[2]) {
      const cx = parseInt(sldSzMatch[1], 10);
      const cy = parseInt(sldSzMatch[2], 10);
      if (cx > 0 && cy > 0) {
        const ratio = cx / cy;
        if (ratio < 1.55) {
          isWidescreen = false;
          slideWidth = 720;
          slideHeight = 540;
        } else {
          isWidescreen = true;
          slideWidth = 960;
          slideHeight = 540;
        }
      }
    }
  }

  const mediaFiles = fileList.filter((f) => /^ppt\/media\//i.test(f));
  const imageCache = new Map<string, Buffer>();

  const getImageBuffer = (relPath: string): Buffer | null => {
    const cleanPath = relPath.replace(/^\.\.\//, "ppt/").replace(/^\//, "");
    if (imageCache.has(cleanPath)) {
      return imageCache.get(cleanPath)!;
    }
    let imgBuf = zip.readFile(cleanPath);
    if (!imgBuf) {
      imgBuf = zip.readFile(`ppt/${relPath.replace(/^\.\.\//, "")}`);
    }
    if (imgBuf) {
      imageCache.set(cleanPath, imgBuf);
    }
    return imgBuf;
  };

  let defaultBgImage: Buffer | null = null;
  if (mediaFiles.length === 1 && /\.(jpe?g|png|webp|gif|bmp)$/i.test(mediaFiles[0]!)) {
    defaultBgImage = zip.readFile(mediaFiles[0]!);
  }

  const slides: PresentationSlide[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i]!;
    const slideXml = zip.readText(slidePath);
    if (!slideXml) continue;

    const slideNumMatch = slidePath.match(/slide(\d+)\.xml$/i);
    const slideNum = slideNumMatch ? slideNumMatch[1] : `${i + 1}`;
    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
    const relsXml = zip.readText(relsPath);

    const relMap = new Map<string, string>();
    if (relsXml) {
      const relMatches = relsXml.match(/<Relationship(?:\s|>).*?\/>/gs) || [];
      for (const rm of relMatches) {
        const idMatch = rm.match(/Id="([^"]+)"/i);
        const targetMatch = rm.match(/Target="([^"]+)"/i);
        if (idMatch && targetMatch && idMatch[1] && targetMatch[1]) {
          relMap.set(idMatch[1], targetMatch[1]);
        }
      }
    }

    let slideBgImage: Buffer | null = null;
    const blipMatch = slideXml.match(/<a:blip\s+[^>]*r:embed="([^"]+)"/i);
    if (blipMatch && blipMatch[1]) {
      const target = relMap.get(blipMatch[1]);
      if (target) {
        slideBgImage = getImageBuffer(target);
      }
    }

    if (!slideBgImage && relMap.size > 0) {
      for (const target of Array.from(relMap.values())) {
        if (/\.(jpe?g|png|webp|gif|bmp)$/i.test(target)) {
          const buf = getImageBuffer(target);
          if (buf) {
            slideBgImage = buf;
            break;
          }
        }
      }
    }

    if (!slideBgImage && defaultBgImage) {
      slideBgImage = defaultBgImage;
    }

    const paragraphs: PresentationParagraph[] = [];
    const shapeMatches = slideXml.match(/<p:sp(?:\s|>).*?<\/p:sp>/gs) || [];

    for (const spXml of shapeMatches) {
      const pMatches = spXml.match(/<a:p(?:\s|>).*?<\/a:p>/gs) || [];
      for (const pXml of pMatches) {
        let align: "left" | "center" | "right" = "left";
        if (/algn="ctr"/i.test(pXml)) {
          align = "center";
        } else if (/algn="r"/i.test(pXml)) {
          align = "right";
        }

        const isBullet = /<a:buChar|<a:buAutoNum|<a:buBlip/i.test(pXml);
        const runMatches = pXml.match(/<a:r(?:\s|>).*?<\/a:r>/gs) || [];
        let pText = "";
        let isBold = false;
        let fontSize: number | undefined;
        let color: [number, number, number] | undefined;

        if (runMatches.length > 0) {
          for (const rXml of runMatches) {
            const tMatches = rXml.match(/<a:t(?:\s|>)(.*?)<\/a:t>/gs) || [];
            for (const tm of tMatches) {
              const clean = decodeXmlEntities(tm.replace(/<[^>]+>/g, ""));
              pText += clean;
            }

            if (/b="1"/i.test(rXml)) {
              isBold = true;
            }

            const szMatch = rXml.match(/sz="(\d+)"/i);
            if (szMatch && szMatch[1]) {
              const szPt = parseInt(szMatch[1], 10) / 100;
              if (szPt > 0) fontSize = szPt;
            }

            const colorMatch = rXml.match(/<a:srgbClr\s+val="([A-Fa-f0-9]{6})"/i);
            if (colorMatch && colorMatch[1]) {
              const hex = colorMatch[1];
              const r = parseInt(hex.substring(0, 2), 16) / 255;
              const g = parseInt(hex.substring(2, 4), 16) / 255;
              const b = parseInt(hex.substring(4, 6), 16) / 255;
              color = [r, g, b];
            }
          }
        } else {
          const tMatches = pXml.match(/<a:t(?:\s|>)(.*?)<\/a:t>/gs) || [];
          for (const tm of tMatches) {
            pText += decodeXmlEntities(tm.replace(/<[^>]+>/g, ""));
          }
        }

        const trimmed = pText.trim();
        if (trimmed.length > 0) {
          paragraphs.push({
            text: trimmed,
            align,
            isBold,
            fontSize,
            isBullet,
            color,
          });
        }
      }
    }

    let title = `Slide ${i + 1}`;
    const bullets: string[] = [];

    if (paragraphs.length > 0) {
      title = paragraphs[0]?.text || `Slide ${i + 1}`;
      for (let j = 1; j < paragraphs.length; j++) {
        const text = paragraphs[j]?.text;
        if (text) {
          bullets.push(text);
        }
      }
    } else {
      const rawLines = extractTextFromXml(slideXml);
      if (rawLines.length > 0) {
        title = rawLines[0] || `Slide ${i + 1}`;
        for (let j = 1; j < rawLines.length; j++) {
          const l = rawLines[j]?.trim();
          if (l) bullets.push(l);
        }
      }
    }

    slides.push({
      title,
      bullets,
      paragraphs,
      backgroundImage: slideBgImage || undefined,
      isWidescreen,
      slideWidth,
      slideHeight,
    });
  }

  return slides.length > 0
    ? slides
    : [{ title: "Presentation", bullets: ["Tidak ada teks slide terdeteksi"] }];
}

function isJpegBuffer(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

export async function preparePresentationSlidesForPdf(
  slides: PresentationSlide[]
): Promise<PresentationSlide[]> {
  const convertedCache = new Map<Buffer, Buffer>();
  const prepared: PresentationSlide[] = [];

  for (const slide of slides) {
    if (!slide.backgroundImage || isJpegBuffer(slide.backgroundImage)) {
      prepared.push(slide);
      continue;
    }

    let jpegBuf = convertedCache.get(slide.backgroundImage);
    if (!jpegBuf) {
      try {
        jpegBuf = await sharp(slide.backgroundImage)
          .rotate()
          .flatten({ background: "#141824" })
          .jpeg({ quality: 90, mozjpeg: true })
          .toBuffer();
        convertedCache.set(slide.backgroundImage, jpegBuf);
      } catch {
        jpegBuf = undefined;
      }
    }

    prepared.push({
      ...slide,
      backgroundImage: jpegBuf,
    });
  }

  return prepared;
}

export function presentationToPdf(
  slides: PresentationSlide[],
  presentationTitle: string = "Presentation"
): Buffer {
  const pdf = new SimplePdfDocument(presentationTitle, "FileFlow Universal Engine");
  const total = slides.length;

  for (let i = 0; i < total; i++) {
    const slide = slides[i]!;
    const w = slide.slideWidth || (slide.isWidescreen !== false ? 960 : 841.89);
    const h = slide.slideHeight || (slide.isWidescreen !== false ? 540 : 595.28);

    pdf.addPage("landscape", w, h);

    if (slide.backgroundImage && isJpegBuffer(slide.backgroundImage)) {
      pdf.drawImage(slide.backgroundImage, 0, 0, w, h);
    } else if (slide.backgroundColor) {
      pdf.drawRect(0, 0, w, h, { fillColor: slide.backgroundColor });
    }

    const hasBgImage = Boolean(slide.backgroundImage && isJpegBuffer(slide.backgroundImage));
    const paras = slide.paragraphs || [];
    const isCenteredPresentation =
      hasBgImage ||
      (paras.length > 0 &&
        paras.every((p) => p.align === "center" || !p.isBullet)) ||
      (paras.length > 0 &&
        paras.filter((p) => p.align === "center").length >= paras.length / 2);

    if (isCenteredPresentation) {
      const lines =
        paras.length > 0
          ? paras.map((p) => p.text)
          : [slide.title, ...slide.bullets].filter(Boolean);

      if (lines.length > 0) {
        let fontSize = 28;
        if (lines.length <= 2) {
          fontSize = 32;
        } else if (lines.length <= 4) {
          fontSize = 28;
        } else if (lines.length <= 6) {
          fontSize = 24;
        } else if (lines.length <= 9) {
          fontSize = 20;
        } else {
          fontSize = 16;
        }

        const lineHeight = fontSize * 1.55;
        const totalBlockHeight = lines.length * lineHeight;
        const startY = h / 2 + totalBlockHeight / 2 - lineHeight * 0.4;
        const centerX = w / 2;

        for (let l = 0; l < lines.length; l++) {
          const lineText = lines[l]!;
          const currentY = startY - l * lineHeight;

          if (hasBgImage) {
            pdf.drawText(lineText, centerX + 1.2, currentY - 1.2, {
              fontSize,
              font: "bold",
              align: "center",
              color: [0.08, 0.08, 0.08],
            });
            pdf.drawText(lineText, centerX, currentY, {
              fontSize,
              font: "bold",
              align: "center",
              color: [1, 1, 1],
            });
          } else {
            pdf.drawText(lineText, centerX, currentY, {
              fontSize,
              font: "bold",
              align: "center",
              color: [0.1, 0.1, 0.1],
            });
          }
        }
      }
    } else {
      pdf.drawText(slide.title, 60, h - 75, {
        fontSize: 22,
        font: "bold",
        color: [0.1, 0.1, 0.1],
      });

      pdf.drawLine(60, h - 90, w - 60, h - 90, [0.88, 0.88, 0.88], 1);

      let currentY = h - 130;
      const bulletsToRender =
        slide.bullets.length > 0
          ? slide.bullets
          : paras.slice(1).map((p) => p.text);

      for (const bullet of bulletsToRender) {
        if (currentY < 80) break;

        pdf.drawRect(65, currentY + 3, 4, 4, {
          fillColor: [0.25, 0.25, 0.25],
        });

        currentY = pdf.drawParagraph(bullet, 80, currentY, w - 140, {
          fontSize: 12,
          font: "regular",
          color: [0.2, 0.2, 0.2],
          lineHeight: 18,
        });

        currentY -= 10;
      }

      pdf.drawText(presentationTitle, 60, 40, {
        fontSize: 8,
        font: "regular",
        color: [0.55, 0.55, 0.55],
      });
      pdf.drawText(`Slide ${i + 1} / ${total}`, w - 60, 40, {
        fontSize: 8,
        font: "regular",
        align: "right",
        color: [0.55, 0.55, 0.55],
      });
    }
  }

  return pdf.toBuffer();
}

export function presentationToMarkdown(slides: PresentationSlide[]): string {
  let md = "";
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i]!;
    md += `## Slide ${i + 1}: ${s.title}\n\n`;
    for (const b of s.bullets) {
      md += `- ${b}\n`;
    }
    md += "\n";
  }
  return md.trim();
}

// -------------------------------------------------------------
// DOCX / ODT / RTF / Word Extractor, Generator & Converter
// -------------------------------------------------------------

export function parseDocx(buffer: Buffer): DocumentSection[] {
  if (isLegacyOle2Buffer(buffer)) {
    throw new Error(LEGACY_OFFICE_BINARY_ERROR);
  }

  const zip = new ZipReader(buffer);
  const docXml = zip.readText("word/document.xml");

  if (!docXml) {
    throw new Error(
      "Arsip DOCX tidak valid atau tidak memiliki dokumen utama (word/document.xml)."
    );
  }

  const sections: DocumentSection[] = [];
  const paragraphMatches = docXml.match(/<w:p(?:\s|>).*?<\/w:p>/gs) || [];

  for (const pXml of paragraphMatches) {
    const headingMatch = pXml.match(/<w:pStyle\s+w:val="(?:Heading|Judul)(\d)"/i);
    const isList = /<w:numPr[\s>]/i.test(pXml) || /<w:pStyle\s+w:val="ListParagraph"/i.test(pXml);

    const textPieces = pXml.match(/<w:t(?:\s[^>]*)?>.*?<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/gs) || [];
    let fullText = "";
    for (const t of textPieces) {
      if (/^<w:tab/i.test(t)) {
        fullText += " ";
      } else if (/^<w:br/i.test(t)) {
        fullText += " ";
      } else {
        fullText += decodeXmlEntities(t.replace(/<[^>]+>/g, ""));
      }
    }

    const trimmed = fullText.trim();
    if (trimmed.length > 0) {
      if (headingMatch && headingMatch[1]) {
        sections.push({
          type: "heading",
          level: parseInt(headingMatch[1], 10) || 1,
          text: trimmed,
        });
      } else if (isList) {
        sections.push({ type: "bullet", text: trimmed });
      } else {
        sections.push({ type: "paragraph", text: trimmed });
      }
    }
  }

  return sections.length > 0
    ? sections
    : [{ type: "paragraph", text: "Dokumen Kosong" }];
}

export function parseOdt(buffer: Buffer): DocumentSection[] {
  const zip = new ZipReader(buffer);
  const contentXml = zip.readText("content.xml");
  if (!contentXml) {
    throw new Error("Arsip ODT tidak valid atau tidak memiliki berkas content.xml.");
  }

  const sections: DocumentSection[] = [];
  const blockRegex = /<(text:h|text:p)(?:\s+([^>]*))?>(.*?)<\/\1>/gs;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(contentXml)) !== null) {
    const tag = match[1]!.toLowerCase();
    const attrs = match[2] || "";
    const inner = match[3] || "";

    const withSpaces = inner
      .replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/gi, (_m, countStr?: string) => {
        const count = countStr ? Math.min(20, parseInt(countStr, 10) || 1) : 1;
        return " ".repeat(count);
      })
      .replace(/<text:tab\s*\/>/gi, " ")
      .replace(/<text:line-break\s*\/>/gi, " ");

    const clean = decodeXmlEntities(withSpaces.replace(/<[^>]+>/g, "")).trim();
    if (!clean) continue;

    if (tag === "text:h") {
      const lvlMatch = attrs.match(/text:outline-level="(\d+)"/i);
      const level = lvlMatch && lvlMatch[1] ? parseInt(lvlMatch[1], 10) : 1;
      sections.push({ type: "heading", level: Math.min(6, Math.max(1, level)), text: clean });
    } else {
      sections.push({ type: "paragraph", text: clean });
    }
  }

  return sections.length > 0
    ? sections
    : [{ type: "paragraph", text: "Dokumen Kosong" }];
}

const RTF_IGNORABLE_DESTINATIONS = new Set([
  "fonttbl",
  "colortbl",
  "stylesheet",
  "info",
  "pict",
  "object",
  "header",
  "footer",
  "headerl",
  "headerr",
  "footerl",
  "footerr",
  "footnote",
  "xmlnstbl",
  "listtable",
  "listoverridetable",
  "rsidtbl",
  "generator",
  "themedata",
  "colorschememapping",
  "datastore",
  "latentstyles",
]);

export function parseRtf(buffer: Buffer): DocumentSection[] {
  const src = buffer.toString("latin1");
  if (!src.trimStart().startsWith("{\\rtf")) {
    throw new Error("Berkas RTF tidak valid (header {\\rtf tidak ditemukan).");
  }

  interface RtfState {
    skip: boolean;
    ucSkipCount: number;
  }

  const stack: RtfState[] = [];
  let state: RtfState = { skip: false, ucSkipCount: 1 };
  let out = "";
  let i = 0;
  const len = src.length;

  while (i < len) {
    const ch = src[i]!;

    if (ch === "{") {
      stack.push({ ...state });
      i++;
      if (src[i] === "\\" && src[i + 1] === "*") {
        state.skip = true;
        i += 2;
      }
      continue;
    }

    if (ch === "}") {
      const prev = stack.pop();
      if (prev) {
        state = prev;
      }
      i++;
      continue;
    }

    if (ch === "\\") {
      i++;
      if (i >= len) break;
      const next = src[i]!;

      if (next === "\\" || next === "{" || next === "}") {
        if (!state.skip) out += next;
        i++;
        continue;
      }

      if (next === "~") {
        if (!state.skip) out += " ";
        i++;
        continue;
      }

      if (next === "-") {
        i++;
        continue;
      }

      if (next === "_") {
        if (!state.skip) out += "-";
        i++;
        continue;
      }

      if (next === "\n" || next === "\r") {
        if (!state.skip) out += "\n";
        i++;
        continue;
      }

      if (next === "'") {
        const hex = src.slice(i + 1, i + 3);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          if (!state.skip) {
            const byteVal = parseInt(hex, 16);
            out += decodeWin1252Byte(byteVal);
          }
          i += 3;
          continue;
        }
      }

      const wordMatch = src.slice(i).match(/^([a-zA-Z]+)(-?\d+)?( ?)/);
      if (wordMatch) {
        const word = wordMatch[1]!.toLowerCase();
        const numStr = wordMatch[2];
        i += wordMatch[0].length;

        if (RTF_IGNORABLE_DESTINATIONS.has(word)) {
          state.skip = true;
          continue;
        }

        if (state.skip) {
          continue;
        }

        if (word === "uc" && numStr !== undefined) {
          state.ucSkipCount = Math.max(0, parseInt(numStr, 10) || 0);
        } else if (word === "u" && numStr !== undefined) {
          let codeUnit = parseInt(numStr, 10);
          if (codeUnit < 0) codeUnit += 65536;
          if (codeUnit > 0) {
            out += String.fromCharCode(codeUnit);
          }
          let toSkip = state.ucSkipCount;
          while (toSkip > 0 && i < len) {
            if (src[i] === "\\" && src[i + 1] === "'") {
              i += 4;
            } else {
              i++;
            }
            toSkip--;
          }
        } else if (word === "par" || word === "line" || word === "sect" || word === "page") {
          out += "\n";
        } else if (word === "tab" || word === "cell") {
          out += "\t";
        } else if (word === "row") {
          out += "\n";
        } else if (word === "emdash") {
          out += "\u2014";
        } else if (word === "endash") {
          out += "\u2013";
        } else if (word === "lquote") {
          out += "\u2018";
        } else if (word === "rquote") {
          out += "\u2019";
        } else if (word === "ldblquote") {
          out += "\u201C";
        } else if (word === "rdblquote") {
          out += "\u201D";
        } else if (word === "bullet") {
          out += "\u2022 ";
        }
        continue;
      }

      i++;
      continue;
    }

    if (ch !== "\r" && ch !== "\n") {
      if (!state.skip) {
        out += ch;
      }
    }
    i++;
  }

  const lines = out
    .split(/\n+/)
    .map((l) => l.replace(/\t+/g, "  ").trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return [{ type: "paragraph", text: "Dokumen Kosong" }];
  }

  return lines.map((line) => {
    if (line.startsWith("\u2022 ") || line.startsWith("- ") || line.startsWith("* ")) {
      return { type: "bullet", text: line.replace(/^(\u2022|-|\*)\s+/, "") };
    }
    return { type: "paragraph", text: line };
  });
}

const WIN1252_EXTRA: Record<number, string> = {
  0x80: "\u20AC",
  0x85: "\u2026",
  0x91: "\u2018",
  0x92: "\u2019",
  0x93: "\u201C",
  0x94: "\u201D",
  0x95: "\u2022",
  0x96: "\u2013",
  0x97: "\u2014",
  0x99: "\u2122",
};

function decodeWin1252Byte(byteVal: number): string {
  if (WIN1252_EXTRA[byteVal]) {
    return WIN1252_EXTRA[byteVal]!;
  }
  return String.fromCharCode(byteVal);
}

export function sectionsToDocx(
  sections: DocumentSection[],
  title: string = "Document"
): Buffer {
  const writer = new ZipWriter();

  writer.addFile(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`
  );

  writer.addFile(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`
  );

  writer.addFile(
    "docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>FileFlow Universal Engine</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
</cp:coreProperties>`
  );

  writer.addFile(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  );

  writer.addFile(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:pPr><w:spacing w:before="160" w:after="60"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph">
    <w:name w:val="List Paragraph"/>
    <w:pPr><w:ind w:left="720"/></w:pPr>
  </w:style>
</w:styles>`
  );

  const normalizedSections =
    sections.length > 0 ? sections : [{ type: "paragraph" as const, text: "" }];

  const bodyParagraphs = normalizedSections
    .map((sec) => {
      const safeText = escapeXml(sec.text);
      if (sec.type === "heading") {
        const lvl = Math.min(3, Math.max(1, sec.level || 1));
        return `    <w:p><w:pPr><w:pStyle w:val="Heading${lvl}"/></w:pPr><w:r><w:t xml:space="preserve">${safeText}</w:t></w:r></w:p>`;
      }
      if (sec.type === "bullet") {
        return `    <w:p><w:pPr><w:pStyle w:val="ListParagraph"/></w:pPr><w:r><w:t xml:space="preserve">- ${safeText}</w:t></w:r></w:p>`;
      }
      return `    <w:p><w:r><w:t xml:space="preserve">${safeText}</w:t></w:r></w:p>`;
    })
    .join("\n");

  writer.addFile(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
${bodyParagraphs}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`
  );

  return writer.toBuffer();
}

export function wordToPdf(
  sections: DocumentSection[],
  docTitle: string = "Document"
): Buffer {
  const pdf = new SimplePdfDocument(docTitle, "FileFlow Universal Engine");
  pdf.addPage("portrait");

  const w = pdf.getWidth();
  const h = pdf.getHeight();
  const leftMargin = 50;
  const rightMargin = 50;
  const contentWidth = w - leftMargin - rightMargin;
  const topMargin = h - 60;
  const bottomMargin = 60;

  let currentY = topMargin;

  const ensureSpace = (neededHeight: number) => {
    if (currentY - neededHeight < bottomMargin) {
      pdf.addPage("portrait");
      currentY = topMargin;
    }
  };

  for (const sec of sections) {
    if (sec.type === "heading") {
      const fontSize = sec.level === 1 ? 16 : sec.level === 2 ? 13 : 11.5;
      ensureSpace(fontSize * 2.5);

      currentY -= 8;
      currentY = pdf.drawParagraph(sec.text, leftMargin, currentY, contentWidth, {
        fontSize,
        font: "bold",
        color: [0.08, 0.08, 0.08],
        lineHeight: fontSize * 1.4,
      });
      currentY -= 6;
    } else if (sec.type === "bullet") {
      ensureSpace(20);
      pdf.drawRect(leftMargin + 4, currentY + 2.5, 3.5, 3.5, {
        fillColor: [0.25, 0.25, 0.25],
      });
      currentY = pdf.drawParagraph(
        sec.text,
        leftMargin + 16,
        currentY,
        contentWidth - 16,
        {
          fontSize: 10,
          font: "regular",
          color: [0.2, 0.2, 0.2],
          lineHeight: 15,
        }
      );
      currentY -= 6;
    } else {
      ensureSpace(20);
      currentY = pdf.drawParagraph(sec.text, leftMargin, currentY, contentWidth, {
        fontSize: 10,
        font: "regular",
        color: [0.2, 0.2, 0.2],
        lineHeight: 15,
      });
      currentY -= 10;
    }
  }

  pdf.drawHeaderFooterOnAllPages();
  return pdf.toBuffer();
}

export function wordToMarkdown(sections: DocumentSection[]): string {
  let md = "";
  for (const s of sections) {
    if (s.type === "heading") {
      const prefix = "#".repeat(Math.max(1, Math.min(s.level || 1, 6)));
      md += `${prefix} ${s.text}\n\n`;
    } else if (s.type === "bullet") {
      md += `- ${s.text}\n`;
    } else {
      md += `\n${s.text}\n\n`;
    }
  }
  return md.replace(/\n{3,}/g, "\n\n").trim();
}

export function markdownToSections(md: string): DocumentSection[] {
  const lines = md.split(/\r?\n/);
  const sections: DocumentSection[] = [];
  let paraBuffer: string[] = [];

  const flushParagraph = () => {
    if (paraBuffer.length > 0) {
      sections.push({
        type: "paragraph",
        text: paraBuffer.join(" ").trim(),
      });
      paraBuffer = [];
    }
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch && headingMatch[1] && headingMatch[2]) {
      flushParagraph();
      sections.push({
        type: "heading",
        level: headingMatch[1].length,
        text: stripInlineMarkdown(headingMatch[2]),
      });
      continue;
    }

    const bulletMatch = trimmed.match(/^(?:[-*+]|\d+\.)\s+(.*)$/);
    if (bulletMatch && bulletMatch[1]) {
      flushParagraph();
      sections.push({
        type: "bullet",
        text: stripInlineMarkdown(bulletMatch[1]),
      });
      continue;
    }

    paraBuffer.push(stripInlineMarkdown(trimmed));
  }

  flushParagraph();

  return sections.length > 0
    ? sections
    : [{ type: "paragraph", text: md.trim() || "Dokumen Kosong" }];
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

export function htmlToSections(html: string): DocumentSection[] {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "");

  const sections: DocumentSection[] = [];
  const blockRegex = /<(h[1-6]|li|p|div|blockquote|pre|tr)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(withoutScripts)) !== null) {
    const tag = match[1]!.toLowerCase();
    const inner = match[2] || "";

    if ((tag === "div" || tag === "blockquote") && /<(?:h[1-6]|p|li|tr)[\s>]/i.test(inner)) {
      continue;
    }

    const clean = decodeXmlEntities(
      inner
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, " | ")
        .replace(/<[^>]+>/g, "")
    )
      .replace(/\s+/g, " ")
      .trim();

    if (!clean) continue;

    if (tag.startsWith("h")) {
      const level = parseInt(tag[1] || "1", 10) || 1;
      sections.push({ type: "heading", level, text: clean });
    } else if (tag === "li") {
      sections.push({ type: "bullet", text: clean });
    } else {
      sections.push({ type: "paragraph", text: clean });
    }
  }

  if (sections.length === 0) {
    const plain = decodeXmlEntities(
      withoutScripts.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
    );
    return plainTextToSections(plain);
  }

  return sections;
}

export function plainTextToSections(text: string): DocumentSection[] {
  const paragraphs = text
    .split(/\r?\n\s*\r?\n/)
    .map((block) =>
      block
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .join(" ")
    )
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) {
    const fallbackLines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    return fallbackLines.length > 0
      ? fallbackLines.map((l) => ({ type: "paragraph", text: l }))
      : [{ type: "paragraph", text: "Dokumen Kosong" }];
  }

  return paragraphs.map((p) => ({ type: "paragraph", text: p }));
}

// -------------------------------------------------------------
// XLSX / Excel Extractor, Generator & Converter
// -------------------------------------------------------------

function colLettersToIndex(letters: string): number {
  let idx = 0;
  const upper = letters.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    const code = upper.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      idx = idx * 26 + (code - 64);
    }
  }
  return Math.max(0, idx - 1);
}

function colIndexToLetters(colIndex: number): string {
  let n = colIndex + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters || "A";
}

export function parseXlsx(buffer: Buffer): SpreadsheetData {
  if (isLegacyOle2Buffer(buffer)) {
    throw new Error(LEGACY_OFFICE_BINARY_ERROR);
  }

  const zip = new ZipReader(buffer);

  let sheetName = "Sheet1";
  const workbookXml = zip.readText("xl/workbook.xml");
  if (workbookXml) {
    const nameMatch = workbookXml.match(/<sheet\s+[^>]*name="([^"]+)"/i);
    if (nameMatch && nameMatch[1]) {
      sheetName = decodeXmlEntities(nameMatch[1]);
    }
  }

  const sharedStrings: string[] = [];
  const sstXml = zip.readText("xl/sharedStrings.xml");
  if (sstXml) {
    const stringMatches = sstXml.match(/<si(?:\s|>).*?<\/si>/gs) || [];
    for (const si of stringMatches) {
      const texts = si.match(/<t(?:\s[^>]*)?>.*?<\/t>/gs) || [];
      let str = "";
      for (const t of texts) {
        str += decodeXmlEntities(t.replace(/<[^>]+>/g, ""));
      }
      sharedStrings.push(str);
    }
  }

  const sheetFiles = zip
    .listFiles()
    .filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(f))
    .sort();
  const sheetXml =
    zip.readText("xl/worksheets/sheet1.xml") ||
    (sheetFiles[0] ? zip.readText(sheetFiles[0]) : null);

  if (!sheetXml) {
    throw new Error(
      "Arsip XLSX tidak valid atau tidak memiliki lembar kerja (xl/worksheets/sheet1.xml)."
    );
  }

  const rows: string[][] = [];
  let maxCols = 0;
  const rowMatches = sheetXml.match(/<row(?:\s|>).*?<\/row>/gs) || [];

  for (const rXml of rowMatches) {
    const rowValues: string[] = [];
    const cellMatches = rXml.match(/<c(?:\s[^>]*)?(?:\/>|>.*?<\/c>)/gs) || [];
    let nextFallbackCol = 0;

    for (const cXml of cellMatches) {
      const refMatch = cXml.match(/\br="([A-Za-z]+)\d+"/i);
      const colIdx =
        refMatch && refMatch[1] ? colLettersToIndex(refMatch[1]) : nextFallbackCol;
      nextFallbackCol = colIdx + 1;

      while (rowValues.length <= colIdx) {
        rowValues.push("");
      }

      const typeMatch = cXml.match(/\bt="([^"]+)"/i);
      const cellType = typeMatch ? typeMatch[1] : "";
      let value = "";

      if (cellType === "inlineStr") {
        const inlineTexts = cXml.match(/<t(?:\s[^>]*)?>.*?<\/t>/gs) || [];
        value = inlineTexts
          .map((t) => decodeXmlEntities(t.replace(/<[^>]+>/g, "")))
          .join("");
      } else {
        const valMatch = cXml.match(/<v>(.*?)<\/v>/is);
        if (valMatch && valMatch[1] !== undefined) {
          const rawVal = decodeXmlEntities(valMatch[1].trim());
          if (cellType === "s") {
            const idx = parseInt(rawVal, 10);
            value = sharedStrings[idx] ?? rawVal;
          } else if (cellType === "b") {
            value = rawVal === "1" ? "TRUE" : "FALSE";
          } else {
            value = rawVal;
          }
        }
      }

      rowValues[colIdx] = value;
    }

    if (rowValues.length > 0 && rowValues.some((v) => v.length > 0)) {
      if (rowValues.length > maxCols) {
        maxCols = rowValues.length;
      }
      rows.push(rowValues);
    }
  }

  for (const row of rows) {
    while (row.length < maxCols) {
      row.push("");
    }
  }

  return {
    sheetName,
    rows: rows.length > 0 ? rows : [[""]],
  };
}

export function rowsToXlsx(
  rows: string[][],
  sheetName: string = "Sheet1"
): Buffer {
  const writer = new ZipWriter();
  const safeSheetName = escapeXml(sheetName.slice(0, 31) || "Sheet1");

  writer.addFile(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`
  );

  writer.addFile(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  );

  writer.addFile(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${safeSheetName}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`
  );

  writer.addFile(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`
  );

  const xmlRows: string[] = [];
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx] || [];
    const rowNum = rIdx + 1;
    const cellsXml: string[] = [];

    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      const val = row[cIdx] ?? "";
      if (val === "") continue;
      const cellRef = `${colIndexToLetters(cIdx)}${rowNum}`;
      const isPureNumber =
        /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(val) && val.length <= 15;

      if (isPureNumber && rIdx > 0) {
        cellsXml.push(`<c r="${cellRef}"><v>${val}</v></c>`);
      } else {
        cellsXml.push(
          `<c r="${cellRef}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
            val
          )}</t></is></c>`
        );
      }
    }

    xmlRows.push(`    <row r="${rowNum}">${cellsXml.join("")}</row>`);
  }

  writer.addFile(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
${xmlRows.join("\n")}
  </sheetData>
</worksheet>`
  );

  return writer.toBuffer();
}

export function spreadsheetToPdf(
  data: SpreadsheetData,
  title: string = "Spreadsheet"
): Buffer {
  const pdf = new SimplePdfDocument(title, "FileFlow Universal Engine");
  pdf.addPage("landscape");

  const w = pdf.getWidth();
  const h = pdf.getHeight();
  const leftMargin = 36;
  const rightMargin = 36;
  const contentWidth = w - leftMargin - rightMargin;
  const rows = data.rows;

  if (rows.length === 0) {
    return pdf.toBuffer();
  }

  const totalCols = Math.max(1, ...rows.map((r) => r.length));
  const maxColsPerBand = 12;

  for (let bandStart = 0; bandStart < totalCols; bandStart += maxColsPerBand) {
    if (bandStart > 0) {
      pdf.addPage("landscape");
    }

    const bandEnd = Math.min(totalCols, bandStart + maxColsPerBand);
    const bandColCount = bandEnd - bandStart;
    const colWidth = contentWidth / bandColCount;
    const bodyFontSize = bandColCount <= 6 ? 8.5 : bandColCount <= 9 ? 7.5 : 6.5;
    const headerFontSize = Math.min(9.5, bodyFontSize + 0.5);
    const rowHeight = bandColCount <= 8 ? 22 : 19;
    const maxCharsPerCell = Math.max(
      4,
      Math.floor((colWidth - 10) / (bodyFontSize * 0.53))
    );

    let currentY = h - 65;
    const bandSuffix =
      totalCols > maxColsPerBand
        ? ` (Kolom ${bandStart + 1}-${bandEnd} dari ${totalCols})`
        : "";

    pdf.drawText(`${title} - ${data.sheetName}${bandSuffix}`, leftMargin, currentY, {
      fontSize: 13,
      font: "bold",
      color: [0.1, 0.1, 0.1],
    });
    currentY -= 22;

    for (let r = 0; r < rows.length; r++) {
      if (currentY - rowHeight < 50) {
        pdf.addPage("landscape");
        currentY = h - 60;
      }

      const row = rows[r]!;
      const isHeader = r === 0;

      if (isHeader) {
        pdf.drawRect(leftMargin, currentY - rowHeight, contentWidth, rowHeight, {
          fillColor: [0.12, 0.12, 0.14],
        });
      } else if (r % 2 === 1) {
        pdf.drawRect(leftMargin, currentY - rowHeight, contentWidth, rowHeight, {
          fillColor: [0.97, 0.97, 0.98],
        });
      }

      for (let c = 0; c < bandColCount; c++) {
        const cellX = leftMargin + c * colWidth;
        const rawCell = (row[bandStart + c] || "").replace(/\s+/g, " ").trim();
        const val =
          rawCell.length > maxCharsPerCell
            ? `${rawCell.slice(0, Math.max(1, maxCharsPerCell - 1))}...`
            : rawCell;

        pdf.drawRect(cellX, currentY - rowHeight, colWidth, rowHeight, {
          strokeColor: [0.88, 0.88, 0.88],
          lineWidth: 0.5,
        });

        pdf.drawText(val, cellX + 5, currentY - rowHeight * 0.68, {
          fontSize: isHeader ? headerFontSize : bodyFontSize,
          font: isHeader ? "bold" : "regular",
          color: isHeader ? [1, 1, 1] : [0.15, 0.15, 0.15],
        });
      }

      currentY -= rowHeight;
    }
  }

  pdf.drawHeaderFooterOnAllPages();
  return pdf.toBuffer();
}

export function spreadsheetToCsv(rows: string[][], delimiter = ","): string {
  return rows
    .map((row) =>
      row
        .map((val) => {
          if (
            val.includes(delimiter) ||
            val.includes('"') ||
            val.includes("\n") ||
            val.includes("\r")
          ) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(delimiter)
    )
    .join("\n");
}

export function spreadsheetToJson(rows: string[][]): string {
  if (rows.length === 0) return "[]";
  const headers = rows[0] || [];
  const items: Array<Record<string, string>> = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c] || `col_${c + 1}`;
      obj[key] = row[c] || "";
    }
    items.push(obj);
  }

  return JSON.stringify(items, null, 2);
}

export function parseDelimitedRows(text: string, delimiter = ","): string[][] {
  const cleanText = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
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
      if (ch === "\r" && cleanText[i + 1] === "\n") {
        i++;
      }
      currentRow.push(currentField.trim());
      currentField = "";
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += ch;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export function jsonToRows(data: unknown): string[][] {
  const items = Array.isArray(data) ? data : [data];
  if (items.length === 0) return [];

  const objectItems = items.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item)
  );

  if (objectItems.length === 0) {
    return [["Value"], ...items.map((v) => [String(v ?? "")])];
  }

  const allKeys = new Set<string>();
  for (const obj of objectItems) {
    for (const k of Object.keys(obj)) {
      allKeys.add(k);
    }
  }

  const headers = Array.from(allKeys);
  const rows: string[][] = [headers];

  for (const obj of objectItems) {
    const row = headers.map((h) => {
      const val = obj[h];
      if (val === null || val === undefined) return "";
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    });
    rows.push(row);
  }

  return rows;
}

// -------------------------------------------------------------
// Genuine PDF Stream & FlateDecode Text Extractor
// -------------------------------------------------------------

export function extractPdfText(buffer: Buffer): string {
  const rawLatin1 = buffer.toString("latin1");
  const decodedStreams: string[] = [];

  let cursor = 0;
  while (cursor < rawLatin1.length) {
    const streamIdx = rawLatin1.indexOf("stream", cursor);
    if (streamIdx === -1) break;

    const beforeChar = streamIdx > 0 ? rawLatin1[streamIdx - 1] : " ";
    if (beforeChar && /[a-zA-Z]/.test(beforeChar)) {
      cursor = streamIdx + 6;
      continue;
    }

    let dataStart = streamIdx + 6;
    if (rawLatin1[dataStart] === "\r" && rawLatin1[dataStart + 1] === "\n") {
      dataStart += 2;
    } else if (rawLatin1[dataStart] === "\n" || rawLatin1[dataStart] === "\r") {
      dataStart += 1;
    } else {
      cursor = streamIdx + 6;
      continue;
    }

    const endStreamIdx = rawLatin1.indexOf("endstream", dataStart);
    if (endStreamIdx === -1) break;

    const dictWindowStart = Math.max(0, streamIdx - 512);
    const dictHeader = rawLatin1.slice(dictWindowStart, streamIdx);

    if (/\/Subtype\s*\/Image/i.test(dictHeader) || /\/Subtype\s*\/Form\b/i.test(dictHeader) === false && /\/Type\s*\/XRef/i.test(dictHeader)) {
      cursor = endStreamIdx + 9;
      continue;
    }

    let dataEnd = endStreamIdx;
    if (dataEnd > dataStart && rawLatin1[dataEnd - 1] === "\n") dataEnd--;
    if (dataEnd > dataStart && rawLatin1[dataEnd - 1] === "\r") dataEnd--;

    const rawBytes = buffer.subarray(dataStart, dataEnd);
    const isFlate = /\/FlateDecode\b/i.test(dictHeader);

    if (isFlate) {
      let inflated: Buffer | null = null;
      try {
        inflated = zlib.inflateSync(rawBytes);
      } catch {
        try {
          inflated = zlib.inflateRawSync(rawBytes);
        } catch {
          inflated = null;
        }
      }
      if (inflated) {
        decodedStreams.push(inflated.toString("latin1"));
      }
    } else {
      decodedStreams.push(rawBytes.toString("latin1"));
    }

    cursor = endStreamIdx + 9;
  }

  const cmap = new Map<string, string>();
  for (const s of decodedStreams) {
    if (s.includes("beginbfchar") || s.includes("beginbfrange")) {
      parseToUnicodeCMap(s, cmap);
    }
  }

  const textLines: string[] = [];

  for (const s of decodedStreams) {
    if (s.includes("beginbfchar") || s.includes("beginbfrange")) {
      continue;
    }
    if (!/\b(?:Tj|TJ)\b/.test(s)) {
      continue;
    }

    const blocks = s.match(/BT[\s\S]*?ET/g) || [s];
    for (const block of blocks) {
      let lineBuf = "";
      const tokenRegex =
        /\((?:\\.|[^\\()])*\)\s*(?:Tj|'|")|<([0-9A-Fa-f\s]+)>\s*Tj|\[([\s\S]*?)\]\s*TJ|\b(T\*|Td|TD|Tm)\b/g;
      let tok: RegExpExecArray | null;

      while ((tok = tokenRegex.exec(block)) !== null) {
        const full = tok[0];
        if (tok[3]) {
          const op = tok[3];
          if (op === "T*") {
            if (lineBuf.trim()) {
              textLines.push(lineBuf.trim());
              lineBuf = "";
            }
          } else if (lineBuf.length > 0 && !lineBuf.endsWith(" ")) {
            lineBuf += "\n";
          }
        } else if (tok[1] !== undefined) {
          lineBuf += decodePdfHexToken(tok[1], cmap);
        } else if (tok[2] !== undefined) {
          lineBuf += decodePdfTjArray(tok[2], cmap);
        } else if (full.startsWith("(")) {
          const closeIdx = full.lastIndexOf(")");
          const inner = full.slice(1, closeIdx);
          lineBuf += decodePdfLiteralToken(inner);
        }
      }

      if (lineBuf.trim()) {
        for (const sub of lineBuf.split(/\n+/)) {
          if (sub.trim()) textLines.push(sub.trim());
        }
      }
    }
  }

  const joined = textLines.join("\n").trim();
  return joined;
}

function parseToUnicodeCMap(streamStr: string, cmap: Map<string, string>): void {
  const bfCharBlocks = streamStr.match(/beginbfchar[\s\S]*?endbfchar/g) || [];
  for (const blk of bfCharBlocks) {
    const pairRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let m: RegExpExecArray | null;
    while ((m = pairRegex.exec(blk)) !== null) {
      const srcHex = m[1]!.toUpperCase();
      const dstHex = m[2]!;
      cmap.set(srcHex, hexToUnicodeString(dstHex));
    }
  }

  const bfRangeBlocks = streamStr.match(/beginbfrange[\s\S]*?endbfrange/g) || [];
  for (const blk of bfRangeBlocks) {
    const rangeRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let m: RegExpExecArray | null;
    while ((m = rangeRegex.exec(blk)) !== null) {
      const startCode = parseInt(m[1]!, 16);
      const endCode = parseInt(m[2]!, 16);
      const baseUnicode = parseInt(m[3]!, 16);
      const hexWidth = m[1]!.length;
      if (endCode >= startCode && endCode - startCode <= 1024) {
        for (let c = startCode; c <= endCode; c++) {
          const key = c.toString(16).toUpperCase().padStart(hexWidth, "0");
          cmap.set(key, String.fromCodePoint(baseUnicode + (c - startCode)));
        }
      }
    }
  }
}

function hexToUnicodeString(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length % 4 === 0 && clean.length >= 4) {
    let out = "";
    for (let i = 0; i < clean.length; i += 4) {
      out += String.fromCharCode(parseInt(clean.slice(i, i + 4), 16));
    }
    return out;
  }
  let out = "";
  for (let i = 0; i < clean.length; i += 2) {
    out += decodeWin1252Byte(parseInt(clean.slice(i, i + 2), 16));
  }
  return out;
}

function decodePdfHexToken(rawHex: string, cmap: Map<string, string>): string {
  const clean = rawHex.replace(/\s+/g, "").toUpperCase();
  if (!clean) return "";

  if (clean.startsWith("FEFF") && clean.length >= 8 && clean.length % 4 === 0) {
    let out = "";
    for (let i = 4; i < clean.length; i += 4) {
      out += String.fromCharCode(parseInt(clean.slice(i, i + 4), 16));
    }
    return out;
  }

  if (cmap.size > 0) {
    const keyLengths = Array.from(new Set(Array.from(cmap.keys()).map((k) => k.length)));
    const step = keyLengths.includes(4) && clean.length % 4 === 0 ? 4 : 2;
    let mapped = "";
    let hit = false;
    for (let i = 0; i < clean.length; i += step) {
      const chunk = clean.slice(i, i + step);
      const found = cmap.get(chunk);
      if (found !== undefined) {
        mapped += found;
        hit = true;
      } else if (chunk.length === 2) {
        mapped += decodeWin1252Byte(parseInt(chunk, 16));
      }
    }
    if (hit) return mapped;
  }

  let out = "";
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const byteVal = parseInt(clean.slice(i, i + 2), 16);
    if (byteVal > 0) {
      out += decodeWin1252Byte(byteVal);
    }
  }
  return out;
}

function decodePdfTjArray(inner: string, cmap: Map<string, string>): string {
  let out = "";
  const itemRegex = /\((?:\\.|[^\\()])*\)|<([0-9A-Fa-f\s]+)>|(-?\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;

  while ((m = itemRegex.exec(inner)) !== null) {
    const full = m[0];
    if (m[1] !== undefined) {
      out += decodePdfHexToken(m[1], cmap);
    } else if (m[2] !== undefined) {
      const kerning = parseFloat(m[2]);
      if (kerning <= -120 && !out.endsWith(" ")) {
        out += " ";
      }
    } else if (full.startsWith("(")) {
      out += decodePdfLiteralToken(full.slice(1, -1));
    }
  }

  return out;
}

function decodePdfLiteralToken(str: string): string {
  let out = "";
  let i = 0;
  while (i < str.length) {
    const ch = str[i]!;
    if (ch !== "\\") {
      out += decodeWin1252Byte(ch.charCodeAt(0) & 0xff);
      i++;
      continue;
    }

    i++;
    if (i >= str.length) break;
    const esc = str[i]!;
    if (esc === "n") {
      out += "\n";
      i++;
    } else if (esc === "r") {
      out += "\r";
      i++;
    } else if (esc === "t") {
      out += "\t";
      i++;
    } else if (esc === "b" || esc === "f") {
      i++;
    } else if (esc === "(" || esc === ")" || esc === "\\") {
      out += esc;
      i++;
    } else if (esc >= "0" && esc <= "7") {
      const octMatch = str.slice(i, i + 3).match(/^[0-7]{1,3}/);
      if (octMatch) {
        const byteVal = parseInt(octMatch[0], 8) & 0xff;
        out += decodeWin1252Byte(byteVal);
        i += octMatch[0].length;
      } else {
        i++;
      }
    } else {
      out += esc;
      i++;
    }
  }

  if (out.length >= 2 && out.charCodeAt(0) === 0xfe && out.charCodeAt(1) === 0xff) {
    let utf16 = "";
    for (let j = 2; j + 1 < out.length; j += 2) {
      utf16 += String.fromCharCode((out.charCodeAt(j) << 8) | out.charCodeAt(j + 1));
    }
    return utf16;
  }

  return out;
}

// -------------------------------------------------------------
// Universal Text / Markdown / Delimited to PDF
// -------------------------------------------------------------

export function textToPdf(rawText: string, title: string = "Text Document"): Buffer {
  const pdf = new SimplePdfDocument(title, "FileFlow Universal Engine");
  pdf.addPage("portrait");

  const w = pdf.getWidth();
  const h = pdf.getHeight();
  const left = 50;
  const contentWidth = w - 100;
  let currentY = h - 60;

  const lines = rawText.split(/\r?\n/);

  for (const line of lines) {
    if (currentY < 60) {
      pdf.addPage("portrait");
      currentY = h - 60;
    }

    if (line.trim().length === 0) {
      currentY -= 12;
      continue;
    }

    currentY = pdf.drawParagraph(line, left, currentY, contentWidth, {
      fontSize: 10,
      font: "regular",
      color: [0.15, 0.15, 0.15],
      lineHeight: 14,
    });
  }

  pdf.drawHeaderFooterOnAllPages();
  return pdf.toBuffer();
}

function extractTextFromXml(xml: string): string[] {
  const textMatches = xml.match(/<a:t(?:\s|>).*?<\/a:t>/gs) || [];
  const lines: string[] = [];

  for (const tm of textMatches) {
    const clean = decodeXmlEntities(tm.replace(/<[^>]+>/g, "")).trim();
    if (clean) {
      lines.push(clean);
    }
  }

  return lines;
}
