// File: src/lib/document/pdf-builder.ts

export type PageOrientation = "portrait" | "landscape";

export interface PdfTextOptions {
  fontSize?: number;
  font?: "regular" | "bold" | "mono";
  color?: [number, number, number]; // RGB 0..1
  align?: "left" | "center" | "right";
  lineHeight?: number;
}

export interface PdfRectOptions {
  fillColor?: [number, number, number];
  strokeColor?: [number, number, number];
  lineWidth?: number;
}

export interface TableColumn {
  header: string;
  width: number;
  align?: "left" | "center" | "right";
}

export interface PdfImageItem {
  id: string;
  data: Buffer;
  width: number;
  height: number;
  objNum?: number;
}

interface PdfPage {
  orientation: PageOrientation;
  width: number;
  height: number;
  commands: string[];
}

export class SimplePdfDocument {
  private pages: PdfPage[] = [];
  private currentPage: PdfPage | null = null;
  private title: string = "Document";
  private author: string = "FileFlow Universal Engine";
  private images: Map<string, PdfImageItem> = new Map();
  private imageKeyToId: Map<string, string> = new Map();
  private imageCounter: number = 0;

  public constructor(title?: string, author?: string) {
    if (title) this.title = title;
    if (author) this.author = author;
  }

  public addPage(
    orientation: PageOrientation = "portrait",
    customWidth?: number,
    customHeight?: number
  ): this {
    const isLandscape = orientation === "landscape";
    let width = isLandscape ? 841.89 : 595.28;
    let height = isLandscape ? 595.28 : 841.89;

    if (customWidth && customHeight && customWidth > 0 && customHeight > 0) {
      width = customWidth;
      height = customHeight;
    }

    const page: PdfPage = {
      orientation,
      width,
      height,
      commands: [],
    };

    this.pages.push(page);
    this.currentPage = page;
    return this;
  }

  public getPageCount(): number {
    return this.pages.length;
  }

  public getCurrentPage(): PdfPage {
    if (!this.currentPage) {
      this.addPage("portrait");
    }
    return this.currentPage!;
  }

  public getWidth(): number {
    return this.getCurrentPage().width;
  }

  public getHeight(): number {
    return this.getCurrentPage().height;
  }

  public drawRect(
    x: number,
    y: number,
    w: number,
    h: number,
    options: PdfRectOptions = {}
  ): this {
    const page = this.getCurrentPage();
    const cmds: string[] = ["q"];

    if (options.fillColor) {
      const [r, g, b] = options.fillColor;
      cmds.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
    }

    if (options.strokeColor) {
      const [r, g, b] = options.strokeColor;
      cmds.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`);
    }

    if (options.lineWidth) {
      cmds.push(`${options.lineWidth.toFixed(2)} w`);
    }

    cmds.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);

    if (options.fillColor && options.strokeColor) {
      cmds.push("B");
    } else if (options.fillColor) {
      cmds.push("f");
    } else if (options.strokeColor) {
      cmds.push("s");
    }

    cmds.push("Q");
    page.commands.push(cmds.join(" "));
    return this;
  }

  public drawLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: [number, number, number] = [0.85, 0.85, 0.85],
    lineWidth: number = 1
  ): this {
    const page = this.getCurrentPage();
    const [r, g, b] = color;
    const cmd = `q ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG ${lineWidth.toFixed(
      2
    )} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l s Q`;
    page.commands.push(cmd);
    return this;
  }

  public drawImage(
    imageBuffer: Buffer,
    x: number,
    y: number,
    w: number,
    h: number,
    pxWidth?: number,
    pxHeight?: number
  ): this {
    const page = this.getCurrentPage();
    if (!imageBuffer || imageBuffer.length < 4) {
      return this;
    }

    let finalPxWidth = pxWidth;
    let finalPxHeight = pxHeight;

    if (!finalPxWidth || !finalPxHeight) {
      const dims = getJpegDimensions(imageBuffer);
      finalPxWidth = dims ? dims.width : 1920;
      finalPxHeight = dims ? dims.height : 1080;
    }

    const key = `${imageBuffer.length}_${imageBuffer.subarray(0, 16).toString("hex")}`;
    let imageId = this.imageKeyToId.get(key);

    if (!imageId) {
      this.imageCounter++;
      imageId = `Im${this.imageCounter}`;
      this.imageKeyToId.set(key, imageId);
      this.images.set(imageId, {
        id: imageId,
        data: imageBuffer,
        width: finalPxWidth,
        height: finalPxHeight,
      });
    }

    const cmd = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(
      2
    )} cm /${imageId} Do Q`;
    page.commands.push(cmd);
    return this;
  }

  public drawText(
    text: string,
    x: number,
    y: number,
    options: PdfTextOptions = {}
  ): this {
    const page = this.getCurrentPage();
    const fontSize = options.fontSize || 10;
    const fontKey =
      options.font === "bold" ? "/F2" : options.font === "mono" ? "/F3" : "/F1";
    const color = options.color || [0.1, 0.1, 0.1];
    const align = options.align || "left";

    const escaped = escapePdfString(text);
    const textWidth = estimateTextWidth(text, fontSize, options.font === "bold");

    let finalX = x;
    if (align === "center") {
      finalX = x - textWidth / 2;
    } else if (align === "right") {
      finalX = x - textWidth;
    }

    const [r, g, b] = color;
    const cmd = `BT ${fontKey} ${fontSize} Tf ${r.toFixed(3)} ${g.toFixed(
      3
    )} ${b.toFixed(3)} rg ${finalX.toFixed(2)} ${y.toFixed(2)} Td (${escaped}) Tj ET`;
    page.commands.push(cmd);
    return this;
  }

  public drawParagraph(
    text: string,
    x: number,
    startY: number,
    maxWidth: number,
    options: PdfTextOptions = {}
  ): number {
    const fontSize = options.fontSize || 10;
    const lineHeight = options.lineHeight || fontSize * 1.4;
    const isBold = options.font === "bold";

    const rawWords = text.split(/\s+/).filter(Boolean);
    if (rawWords.length === 0) return startY;

    const maxCharsPerToken = Math.max(
      4,
      Math.floor(maxWidth / Math.max(1, fontSize * (isBold ? 0.6 : 0.53)))
    );

    const words: string[] = [];
    for (const rawWord of rawWords) {
      if (estimateTextWidth(rawWord, fontSize, isBold) > maxWidth && rawWord.length > maxCharsPerToken) {
        for (let idx = 0; idx < rawWord.length; idx += maxCharsPerToken) {
          words.push(rawWord.slice(idx, idx + maxCharsPerToken));
        }
      } else {
        words.push(rawWord);
      }
    }

    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const candidateWidth = estimateTextWidth(candidate, fontSize, isBold);

      if (candidateWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = candidate;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    let y = startY;
    for (const line of lines) {
      this.drawText(line, x, y, options);
      y -= lineHeight;
    }

    return y;
  }

  public drawHeaderFooter(pageNumber: number, totalPages: number): this {
    const page = this.getCurrentPage();
    const w = page.width;
    const h = page.height;

    this.drawLine(40, h - 35, w - 40, h - 35, [0.88, 0.88, 0.88], 0.75);
    this.drawText(this.title, 40, h - 28, {
      fontSize: 8,
      font: "bold",
      color: [0.4, 0.4, 0.4],
    });
    this.drawText("FILEFLOW", w - 40, h - 28, {
      fontSize: 8,
      font: "bold",
      align: "right",
      color: [0.5, 0.5, 0.5],
    });

    this.drawLine(40, 40, w - 40, 40, [0.88, 0.88, 0.88], 0.75);
    this.drawText(this.author, 40, 28, {
      fontSize: 8,
      font: "regular",
      color: [0.5, 0.5, 0.5],
    });
    this.drawText(`Halaman ${pageNumber} dari ${totalPages}`, w - 40, 28, {
      fontSize: 8,
      font: "regular",
      align: "right",
      color: [0.4, 0.4, 0.4],
    });

    return this;
  }

  public drawHeaderFooterOnAllPages(): this {
    const total = this.pages.length;
    if (total === 0) return this;

    const prevPage = this.currentPage;
    for (let i = 0; i < total; i++) {
      this.currentPage = this.pages[i]!;
      this.drawHeaderFooter(i + 1, total);
    }
    this.currentPage = prevPage;
    return this;
  }

  public toBuffer(): Buffer {
    if (this.pages.length === 0) {
      this.addPage("portrait");
    }

    const numPages = this.pages.length;
    const pageObjNums: number[] = [];
    const contentObjNums: number[] = [];

    for (let i = 0; i < numPages; i++) {
      pageObjNums.push(3 + i * 2);
      contentObjNums.push(4 + i * 2);
    }

    const font1Num = 3 + numPages * 2;
    const font2Num = font1Num + 1;
    const font3Num = font1Num + 2;
    const infoNum = font1Num + 3;

    let nextObjNum = infoNum + 1;
    const imageList = Array.from(this.images.values());
    for (const img of imageList) {
      img.objNum = nextObjNum++;
    }

    const totalObjects = nextObjNum - 1;
    const chunks: (string | Buffer)[] = [];
    const offsets: number[] = [];

    chunks.push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

    const getOffset = (): number => {
      let len = 0;
      for (const c of chunks) {
        if (typeof c === "string") {
          len += Buffer.byteLength(c, "binary");
        } else {
          len += c.length;
        }
      }
      return len;
    };

    offsets[1] = getOffset();
    chunks.push(`1 0 obj\n<<\n  /Type /Catalog\n  /Pages 2 0 R\n>>\nendobj\n`);

    offsets[2] = getOffset();
    const kidsStr = pageObjNums.map((n) => `${n} 0 R`).join(" ");
    chunks.push(
      `2 0 obj\n<<\n  /Type /Pages\n  /Kids [${kidsStr}]\n  /Count ${numPages}\n>>\nendobj\n`
    );

    let xObjectDict = "";
    if (imageList.length > 0) {
      const entries = imageList
        .map((img) => `/${img.id} ${img.objNum} 0 R`)
        .join("\n      ");
      xObjectDict = `\n    /XObject <<\n      ${entries}\n    >>`;
    }

    for (let i = 0; i < numPages; i++) {
      const page = this.pages[i]!;
      const pageNum = pageObjNums[i]!;
      const contentNum = contentObjNums[i]!;

      offsets[pageNum] = getOffset();
      chunks.push(
        `${pageNum} 0 obj\n<<\n  /Type /Page\n  /Parent 2 0 R\n  /MediaBox [0 0 ${page.width.toFixed(
          2
        )} ${page.height.toFixed(2)}]\n  /Contents ${contentNum} 0 R\n  /Resources <<\n    /Font <<\n      /F1 ${font1Num} 0 R\n      /F2 ${font2Num} 0 R\n      /F3 ${font3Num} 0 R\n    >>${xObjectDict}\n  >>\n>>\nendobj\n`
      );

      const streamContent = page.commands.join("\n");
      const streamBytes = Buffer.byteLength(streamContent, "binary");

      offsets[contentNum] = getOffset();
      chunks.push(
        `${contentNum} 0 obj\n<<\n  /Length ${streamBytes}\n>>\nstream\n${streamContent}\nendstream\nendobj\n`
      );
    }

    offsets[font1Num] = getOffset();
    chunks.push(
      `${font1Num} 0 obj\n<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Helvetica\n  /Encoding /WinAnsiEncoding\n>>\nendobj\n`
    );

    offsets[font2Num] = getOffset();
    chunks.push(
      `${font2Num} 0 obj\n<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Helvetica-Bold\n  /Encoding /WinAnsiEncoding\n>>\nendobj\n`
    );

    offsets[font3Num] = getOffset();
    chunks.push(
      `${font3Num} 0 obj\n<<\n  /Type /Font\n  /Subtype /Type1\n  /BaseFont /Courier\n  /Encoding /WinAnsiEncoding\n>>\nendobj\n`
    );

    offsets[infoNum] = getOffset();
    chunks.push(
      `${infoNum} 0 obj\n<<\n  /Title (${escapePdfString(
        this.title
      )})\n  /Author (${escapePdfString(
        this.author
      )})\n  /Producer (FileFlow PDF Engine v2.0)\n  /CreationDate (D:${formatPdfDate(
        new Date()
      )})\n>>\nendobj\n`
    );

    for (const img of imageList) {
      if (!img.objNum) continue;
      offsets[img.objNum] = getOffset();
      chunks.push(
        `${img.objNum} 0 obj\n<<\n  /Type /XObject\n  /Subtype /Image\n  /Width ${img.width}\n  /Height ${img.height}\n  /ColorSpace /DeviceRGB\n  /BitsPerComponent 8\n  /Filter /DCTDecode\n  /Length ${img.data.length}\n>>\nstream\n`
      );
      chunks.push(img.data);
      chunks.push(`\nendstream\nendobj\n`);
    }

    const startXref = getOffset();
    chunks.push(`xref\n0 ${totalObjects + 1}\n`);
    chunks.push(`0000000000 65535 f \n`);

    for (let i = 1; i <= totalObjects; i++) {
      const off = offsets[i] || 0;
      const padded = off.toString().padStart(10, "0");
      chunks.push(`${padded} 00000 n \n`);
    }

    chunks.push(
      `trailer\n<<\n  /Size ${
        totalObjects + 1
      }\n  /Root 1 0 R\n  /Info ${infoNum} 0 R\n>>\nstartxref\n${startXref}\n%%EOF\n`
    );

    const bufferChunks = chunks.map((c) =>
      typeof c === "string" ? Buffer.from(c, "binary") : c
    );
    return Buffer.concat(bufferChunks);
  }
}

export function getJpegDimensions(
  buffer: Buffer
): { width: number; height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset < buffer.length - 8) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === undefined) break;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (offset + 4 > buffer.length) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (offset + 9 > buffer.length) break;
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }
    offset += 2 + length;
  }
  return null;
}

const UNICODE_TO_WINANSI: Record<number, number> = {
  0x20ac: 0x80, // Euro
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85, // Ellipsis
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91, // Left single quote
  0x2019: 0x92, // Right single quote
  0x201c: 0x93, // Left double quote
  0x201d: 0x94, // Right double quote
  0x2022: 0x95, // Bullet
  0x2013: 0x96, // En dash
  0x2014: 0x97, // Em dash
  0x02dc: 0x98,
  0x2122: 0x99, // Trademark
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

function escapePdfString(str: string): string {
  const normalized = str.replace(/[\r\n\t]+/g, " ");
  let out = "";

  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    if (code === 0x5c) {
      out += "\\\\";
    } else if (code === 0x28) {
      out += "\\(";
    } else if (code === 0x29) {
      out += "\\)";
    } else if (code >= 0x20 && code <= 0x7e) {
      out += normalized[i];
    } else if (code >= 0xa0 && code <= 0xff) {
      out += `\\${code.toString(8).padStart(3, "0")}`;
    } else if (UNICODE_TO_WINANSI[code] !== undefined) {
      const winByte = UNICODE_TO_WINANSI[code]!;
      out += `\\${winByte.toString(8).padStart(3, "0")}`;
    } else {
      out += "?";
    }
  }

  return out;
}

function estimateTextWidth(text: string, fontSize: number, isBold = false): number {
  const avgCharWidthRatio = isBold ? 0.6 : 0.53;
  return text.length * fontSize * avgCharWidthRatio;
}

function formatPdfDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}${m}${d}${h}${min}${s}Z`;
}
