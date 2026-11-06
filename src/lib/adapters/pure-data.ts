// File: src/lib/adapters/pure-data.ts

import fs from "fs";
import path from "path";
import { decodeXmlEntities, parseDelimitedRows } from "../document/office-parser";
import {
  ConversionResult,
  ConversionTarget,
  FileCategory,
  IConversionAdapter,
} from "./types";

const TARGET_FORMAT_MIME: Record<string, string> = {
  json: "application/json",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  yaml: "application/x-yaml",
  xml: "application/xml",
  txt: "text/plain",
  html: "text/html",
  md: "text/markdown",
};

const TARGET_FORMAT_LABELS: Record<string, string> = {
  json: "JSON (JavaScript Object Notation)",
  csv: "CSV (Comma Separated Values)",
  tsv: "TSV (Tab Separated Values)",
  yaml: "YAML (YAML Ain't Markup Language)",
  xml: "XML (Extensible Markup Language)",
  txt: "TXT (Plain Text Document)",
  html: "HTML (HyperText Markup Language)",
  md: "MD (Markdown Document)",
};

function parseDelimitedObjects(
  text: string,
  delimiter: string
): Array<Record<string, string>> {
  const rows = parseDelimitedRows(text, delimiter);
  if (rows.length === 0) return [];

  const headers = rows[0] || [];
  const result: Array<Record<string, string>> = [];

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i] || [];
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const key = h || `col_${idx + 1}`;
      row[key] = values[idx] ?? "";
    });
    result.push(row);
  }

  return result;
}

function toDelimited(data: unknown, delimiter = ","): string {
  const normalizedData = unwrapRootArrayIfApplicable(data);
  const items = Array.isArray(normalizedData) ? normalizedData : [normalizedData];
  if (items.length === 0) return "";

  const allKeys = new Set<string>();
  items.forEach((item) => {
    if (typeof item === "object" && item !== null && !Array.isArray(item)) {
      Object.keys(item as Record<string, unknown>).forEach((k) => allKeys.add(k));
    }
  });

  const headers = Array.from(allKeys);
  if (headers.length === 0) {
    return items.map((v) => String(v ?? "")).join("\n");
  }

  const escapeVal = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const str = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (
      str.includes(delimiter) ||
      str.includes('"') ||
      str.includes("\n") ||
      str.includes("\r")
    ) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = [headers.map(escapeVal).join(delimiter)];
  items.forEach((item) => {
    if (typeof item === "object" && item !== null && !Array.isArray(item)) {
      const row = headers.map((h) => escapeVal((item as Record<string, unknown>)[h]));
      rows.push(row.join(delimiter));
    }
  });

  return rows.join("\n");
}

function unwrapRootArrayIfApplicable(data: unknown): unknown {
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 1 && Array.isArray(entries[0]?.[1])) {
      return entries[0][1];
    }
  }
  return data;
}

function toYaml(data: unknown, indent: number = 0): string {
  const prefix = " ".repeat(indent);
  if (data === null || data === undefined) return `${prefix}null\n`;
  if (typeof data === "number" || typeof data === "boolean") return `${prefix}${data}\n`;
  if (typeof data === "string") {
    if (
      data === "" ||
      data.includes("\n") ||
      data.includes(":") ||
      data.includes("#") ||
      /^(?:true|false|null|~|-?\d+(?:\.\d+)?)$/i.test(data)
    ) {
      return `${prefix}"${data.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"\n`;
    }
    return `${prefix}${data}\n`;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return `${prefix}[]\n`;
    let res = "";
    for (const item of data) {
      if (typeof item === "object" && item !== null) {
        res += `${prefix}-\n${toYaml(item, indent + 2)}`;
      } else {
        res += `${prefix}- ${toYaml(item, 0)}`;
      }
    }
    return res;
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return `${prefix}{}\n`;
    let res = "";
    for (const [k, v] of entries) {
      if (typeof v === "object" && v !== null) {
        if (Array.isArray(v) && v.length === 0) {
          res += `${prefix}${k}: []\n`;
        } else if (!Array.isArray(v) && Object.keys(v).length === 0) {
          res += `${prefix}${k}: {}\n`;
        } else {
          res += `${prefix}${k}:\n${toYaml(v, indent + 2)}`;
        }
      } else {
        res += `${prefix}${k}: ${toYaml(v, 0)}`;
      }
    }
    return res;
  }

  return `${prefix}${String(data)}\n`;
}

interface YamlLine {
  indent: number;
  text: string;
}

function parseScalarYamlValue(rawVal: string): unknown {
  const trimmed = stripInlineYamlComment(rawVal).trim();
  if (trimmed === "" || trimmed === "null" || trimmed === "~") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "[]") return [];
  if (trimmed === "{}") return {};

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const unquoted = trimmed.slice(1, -1);
    return trimmed.startsWith('"')
      ? unquoted.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\")
      : unquoted.replace(/''/g, "'");
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((part) => parseScalarYamlValue(part));
  }

  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isNaN(num)) return num;
  }

  return trimmed;
}

function stripInlineYamlComment(val: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < val.length; i++) {
    const ch = val[i]!;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle && val[i - 1] !== "\\") inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble && (i === 0 || /\s/.test(val[i - 1] || ""))) {
      return val.slice(0, i);
    }
  }
  return val;
}

export function parseSimpleYaml(yamlStr: string): unknown {
  const trimmedFull = yamlStr.trim();
  if (!trimmedFull) return {};

  if (trimmedFull.startsWith("{") || trimmedFull.startsWith("[")) {
    try {
      return JSON.parse(trimmedFull);
    } catch {
      // Continue with structural YAML parser
    }
  }

  const lines: YamlLine[] = [];
  for (const rawLine of yamlStr.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed === "---" || trimmed === "...") {
      continue;
    }
    const indentMatch = rawLine.match(/^(\s*)/);
    const indent = indentMatch && indentMatch[1] ? indentMatch[1].replace(/\t/g, "  ").length : 0;
    lines.push({ indent, text: trimmed });
  }

  if (lines.length === 0) return {};

  const parseBlock = (startIndex: number, minIndent: number): { value: unknown; nextIndex: number } => {
    const first = lines[startIndex];
    if (!first || first.indent < minIndent) {
      return { value: null, nextIndex: startIndex };
    }

    const blockIndent = first.indent;

    if (first.text === "-" || first.text.startsWith("- ")) {
      const arr: unknown[] = [];
      let idx = startIndex;

      while (idx < lines.length) {
        const line = lines[idx]!;
        if (line.indent < blockIndent) break;
        if (line.indent > blockIndent) break;
        if (line.text !== "-" && !line.text.startsWith("- ")) break;

        const rest = line.text.slice(1).trim();
        if (!rest) {
          const nested = parseBlock(idx + 1, blockIndent + 1);
          arr.push(nested.value);
          idx = nested.nextIndex;
        } else {
          const inlineKv = matchYamlKeyValue(rest);
          if (inlineKv) {
            const itemObj: Record<string, unknown> = {};
            const [firstKey, firstValRaw] = inlineKv;
            if (firstValRaw === "") {
              const nestedVal = parseBlock(idx + 1, blockIndent + 2);
              itemObj[firstKey] = nestedVal.value;
              idx = nestedVal.nextIndex;
            } else {
              itemObj[firstKey] = parseScalarYamlValue(firstValRaw);
              idx++;
            }

            while (idx < lines.length && lines[idx]!.indent > blockIndent) {
              const subLine = lines[idx]!;
              const subKv = matchYamlKeyValue(subLine.text);
              if (!subKv) {
                idx++;
                continue;
              }
              const [subK, subVRaw] = subKv;
              if (subVRaw === "") {
                const subNested = parseBlock(idx + 1, subLine.indent + 1);
                itemObj[subK] = subNested.value;
                idx = subNested.nextIndex;
              } else {
                itemObj[subK] = parseScalarYamlValue(subVRaw);
                idx++;
              }
            }
            arr.push(itemObj);
          } else {
            arr.push(parseScalarYamlValue(rest));
            idx++;
          }
        }
      }

      return { value: arr, nextIndex: idx };
    }

    const obj: Record<string, unknown> = {};
    let idx = startIndex;

    while (idx < lines.length) {
      const line = lines[idx]!;
      if (line.indent < blockIndent) break;
      if (line.indent > blockIndent) {
        idx++;
        continue;
      }
      if (line.text === "-" || line.text.startsWith("- ")) break;

      const kv = matchYamlKeyValue(line.text);
      if (!kv) {
        idx++;
        continue;
      }

      const [key, valRaw] = kv;
      if (valRaw === "") {
        const nested = parseBlock(idx + 1, blockIndent + 1);
        obj[key] = nested.value;
        idx = nested.nextIndex;
      } else {
        obj[key] = parseScalarYamlValue(valRaw);
        idx++;
      }
    }

    return { value: obj, nextIndex: idx };
  };

  return parseBlock(0, 0).value;
}

function matchYamlKeyValue(text: string): [string, string] | null {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle && text[i - 1] !== "\\") inDouble = !inDouble;
    else if (ch === ":" && !inSingle && !inDouble) {
      const next = text[i + 1];
      if (next === undefined || /\s/.test(next)) {
        const rawKey = text.slice(0, i).trim().replace(/^["']|["']$/g, "");
        if (!rawKey) return null;
        const rawVal = text.slice(i + 1).trim();
        return [rawKey, rawVal];
      }
    }
  }
  return null;
}

function toXml(data: unknown, rootTag = "root", indent = 0): string {
  const prefix = " ".repeat(indent);
  if (data === null || data === undefined) {
    return `${prefix}<${rootTag}/>\n`;
  }
  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
    const escaped = String(data)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `${prefix}<${rootTag}>${escaped}</${rootTag}>\n`;
  }
  if (Array.isArray(data)) {
    let res = `${prefix}<${rootTag}>\n`;
    for (const item of data) {
      res += toXml(item, "item", indent + 2);
    }
    res += `${prefix}</${rootTag}>\n`;
    return res;
  }
  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    const attrPairs: string[] = [];
    const childEntries: Array<[string, unknown]> = [];
    let textValue: unknown;

    for (const [key, value] of entries) {
      if (key.startsWith("@") && key.length > 1 && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
        const attrName = key.slice(1).replace(/[^a-zA-Z0-9_:-]/g, "_");
        const attrVal = String(value)
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;");
        attrPairs.push(`${attrName}="${attrVal}"`);
      } else if (key === "#text") {
        textValue = value;
      } else {
        childEntries.push([key, value]);
      }
    }

    const openTag = attrPairs.length > 0 ? `${rootTag} ${attrPairs.join(" ")}` : rootTag;
    if (childEntries.length === 0 && textValue === undefined) {
      return `${prefix}<${openTag}/>\n`;
    }
    if (childEntries.length === 0 && textValue !== undefined) {
      const escaped = String(textValue)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `${prefix}<${openTag}>${escaped}</${rootTag}>\n`;
    }

    let res = `${prefix}<${openTag}>\n`;
    for (const [key, value] of childEntries) {
      const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "_") || "field";
      if (Array.isArray(value)) {
        for (const elem of value) {
          res += toXml(elem, safeKey, indent + 2);
        }
      } else {
        res += toXml(value, safeKey, indent + 2);
      }
    }
    res += `${prefix}</${rootTag}>\n`;
    return res;
  }
  return `${prefix}<${rootTag}/>\n`;
}

interface ParsedXmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: ParsedXmlNode[];
  text: string;
}

export function parseSimpleXml(xmlText: string): Record<string, unknown> {
  const cdataList: string[] = [];
  const prepared = xmlText
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, content: string) => {
      const idx = cdataList.length;
      cdataList.push(content);
      return `__CDATA_TOKEN_${idx}__`;
    })
    .trim();

  const restoreCdataAndEntities = (raw: string): string => {
    const withCdata = raw.replace(/__CDATA_TOKEN_(\d+)__/g, (_m, idxStr: string) => {
      return cdataList[parseInt(idxStr, 10)] ?? "";
    });
    return decodeXmlEntities(withCdata);
  };

  const rootHolder: ParsedXmlNode = {
    tag: "__root__",
    attrs: {},
    children: [],
    text: "",
  };
  const stack: ParsedXmlNode[] = [rootHolder];

  const tokenRegex = /<\/?([a-zA-Z_][\w:.-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(prepared)) !== null) {
    const full = match[0];
    const textChunk = match[4];

    if (textChunk !== undefined) {
      const current = stack[stack.length - 1];
      if (current) {
        current.text += textChunk;
      }
      continue;
    }

    const rawTagName = match[1]!;
    const localTag = rawTagName.includes(":")
      ? rawTagName.split(":").pop() || rawTagName
      : rawTagName;
    const attrStr = match[2] || "";
    const selfClosing = match[3] === "/" || full.endsWith("/>");
    const isClosing = full.startsWith("</");

    if (isClosing) {
      if (stack.length > 1) {
        stack.pop();
      }
      continue;
    }

    const attrs: Record<string, string> = {};
    const attrRegex = /([a-zA-Z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let am: RegExpExecArray | null;
    while ((am = attrRegex.exec(attrStr)) !== null) {
      const rawAttrName = am[1]!;
      if (rawAttrName === "xmlns" || rawAttrName.startsWith("xmlns:")) {
        continue;
      }
      const cleanAttr = rawAttrName.includes(":")
        ? rawAttrName.split(":").pop() || rawAttrName
        : rawAttrName;
      const val = am[2] !== undefined ? am[2] : am[3] || "";
      attrs[`@${cleanAttr}`] = decodeXmlEntities(val);
    }

    const node: ParsedXmlNode = {
      tag: localTag,
      attrs,
      children: [],
      text: "",
    };

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(node);
    }

    if (!selfClosing) {
      stack.push(node);
    }
  }

  const nodeToValue = (node: ParsedXmlNode): unknown => {
    const hasAttrs = Object.keys(node.attrs).length > 0;
    const cleanText = restoreCdataAndEntities(node.text).trim();

    if (node.children.length === 0) {
      if (!hasAttrs) {
        return cleanText;
      }
      const obj: Record<string, unknown> = { ...node.attrs };
      if (cleanText) {
        obj["#text"] = cleanText;
      }
      return obj;
    }

    const obj: Record<string, unknown> = { ...node.attrs };
    for (const child of node.children) {
      const childVal = nodeToValue(child);
      const existing = obj[child.tag];
      if (existing !== undefined) {
        if (Array.isArray(existing)) {
          existing.push(childVal);
        } else {
          obj[child.tag] = [existing, childVal];
        }
      } else {
        obj[child.tag] = childVal;
      }
    }
    if (cleanText) {
      obj["#text"] = cleanText;
    }
    return obj;
  };

  if (rootHolder.children.length === 1) {
    const top = rootHolder.children[0]!;
    const val = nodeToValue(top);
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      return val as Record<string, unknown>;
    }
    return { [top.tag]: val };
  }

  if (rootHolder.children.length > 1) {
    const out: Record<string, unknown> = {};
    for (const child of rootHolder.children) {
      const childVal = nodeToValue(child);
      const existing = out[child.tag];
      if (existing !== undefined) {
        if (Array.isArray(existing)) {
          existing.push(childVal);
        } else {
          out[child.tag] = [existing, childVal];
        }
      } else {
        out[child.tag] = childVal;
      }
    }
    return out;
  }

  return { text: restoreCdataAndEntities(prepared.replace(/<[^>]+>/g, "")).trim() };
}

function sanitizeMarkdownLinkUrl(rawHref: string): string {
  const trimmed = rawHref.trim();
  if (!trimmed) {
    return "#";
  }
  if (
    trimmed.startsWith("#") ||
    trimmed.startsWith("/") ||
    /^https?:\/\//i.test(trimmed) ||
    /^mailto:/i.test(trimmed)
  ) {
    return trimmed.replace(/"/g, "&quot;");
  }
  return "#";
}

export function markdownToHtml(md: string): string {
  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const html = escaped
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^# (.*$)/gim, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/gim, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/gim,
      (_match, label: string, rawHref: string) => {
        const safeHref = sanitizeMarkdownLinkUrl(
          rawHref.replace(/&amp;/g, "&")
        );
        return `<a href="${safeHref}" rel="noopener noreferrer">${label}</a>`;
      }
    )
    .replace(/^\s*-\s+(.*$)/gim, "<li>$1</li>")
    .replace(/\n\n/gim, "<br/>\n");

  return `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"/><title>Converted Document</title></head>\n<body>\n${html}\n</body>\n</html>`;
}

function markdownToPlainText(md: string): string {
  return md
    .replace(/#+\s+/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^-\s+/gm, "* ")
    .trim();
}

function formatStructuredDataAsPlainText(data: unknown): string {
  if (typeof data === "string") return data;
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
    return toDelimited(data, "\t");
  }
  return toYaml(data).trim();
}

export class PureDataAdapter implements IConversionAdapter {
  public readonly id: string = "pure-data";
  public readonly name: string = "Pure TypeScript Data & Text Converter";
  public readonly category: FileCategory = "data";

  private supportedSources: string[] = [
    "json",
    "csv",
    "tsv",
    "yaml",
    "xml",
    "txt",
    "md",
  ];

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public getSetupInstructions(): string {
    return "Engine Data Converter terpasang dan berjalan secara native di runtime TypeScript/Node.js.";
  }

  public getSupportedSources(): string[] {
    return [...this.supportedSources];
  }

  public async getSupportedTargets(sourceFormat: string): Promise<ConversionTarget[]> {
    const cleanSource = sourceFormat.toLowerCase().replace(/^\.+/, "");
    const targets: ConversionTarget[] = [];

    const availableMap: Record<string, string[]> = {
      json: ["csv", "tsv", "yaml", "xml", "txt"],
      csv: ["json", "tsv", "yaml", "xml", "txt"],
      tsv: ["json", "csv", "yaml", "xml", "txt"],
      yaml: ["json", "csv", "tsv", "xml", "txt"],
      xml: ["json", "yaml", "csv", "tsv", "txt"],
      txt: ["json", "md"],
      md: ["html", "txt", "json"],
    };

    const targetList = availableMap[cleanSource] || [];

    for (const target of targetList) {
      targets.push({
        targetFormat: target,
        label: TARGET_FORMAT_LABELS[target] || target.toUpperCase(),
        mimeType: TARGET_FORMAT_MIME[target] || "text/plain",
        adapterId: this.id,
        isAvailable: true,
      });
    }

    return targets;
  }

  public async convert(
    inputPath: string,
    outputPath: string,
    sourceFormat: string,
    targetFormat: string
  ): Promise<ConversionResult> {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`File sumber tidak ditemukan pada: ${inputPath}`);
    }

    const startTime = Date.now();
    const sourceText = fs.readFileSync(inputPath, "utf-8");
    const cleanSource = sourceFormat.toLowerCase().replace(/^\.+/, "");
    const cleanTarget = targetFormat.toLowerCase().replace(/^\.+/, "");
    const baseName = path.basename(inputPath, path.extname(inputPath)) || "Dokumen";

    let parsedData: unknown = null;

    if (cleanSource === "json") {
      try {
        parsedData = JSON.parse(sourceText);
      } catch (err) {
        throw new Error(`File JSON tidak valid: ${(err as Error).message}`);
      }
    } else if (cleanSource === "csv") {
      parsedData = parseDelimitedObjects(sourceText, ",");
    } else if (cleanSource === "tsv") {
      parsedData = parseDelimitedObjects(sourceText, "\t");
    } else if (cleanSource === "yaml" || cleanSource === "yml") {
      parsedData = parseSimpleYaml(sourceText);
    } else if (cleanSource === "xml") {
      parsedData = parseSimpleXml(sourceText);
    } else if (cleanSource === "txt" || cleanSource === "md") {
      parsedData = {
        title: baseName,
        content: sourceText,
        lineCount: sourceText.split(/\r?\n/).length,
        byteLength: Buffer.byteLength(sourceText, "utf-8"),
      };
    } else {
      throw new Error(`Format sumber ${sourceFormat} tidak didukung oleh ${this.name}`);
    }

    let outputText = "";

    if (cleanTarget === "json") {
      outputText = JSON.stringify(parsedData, null, 2);
    } else if (cleanTarget === "csv") {
      outputText = toDelimited(parsedData, ",");
    } else if (cleanTarget === "tsv") {
      outputText = toDelimited(parsedData, "\t");
    } else if (cleanTarget === "yaml" || cleanTarget === "yml") {
      outputText = toYaml(parsedData);
    } else if (cleanTarget === "xml") {
      outputText = '<?xml version="1.0" encoding="UTF-8"?>\n' + toXml(parsedData);
    } else if (cleanTarget === "html") {
      outputText =
        cleanSource === "md"
          ? markdownToHtml(sourceText)
          : `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body><pre>${sourceText
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")}</pre></body></html>`;
    } else if (cleanTarget === "txt") {
      outputText =
        cleanSource === "md"
          ? markdownToPlainText(sourceText)
          : cleanSource === "txt"
          ? sourceText
          : formatStructuredDataAsPlainText(parsedData);
    } else if (cleanTarget === "md") {
      if (cleanSource === "txt") {
        const trimmed = sourceText.trim();
        outputText = trimmed.startsWith("#") ? trimmed : `# ${baseName}\n\n${trimmed}`;
      } else {
        outputText = `# ${baseName}\n\n\`\`\`json\n${JSON.stringify(
          parsedData,
          null,
          2
        )}\n\`\`\``;
      }
    } else {
      throw new Error(`Format target ${targetFormat} tidak didukung oleh ${this.name}`);
    }

    fs.writeFileSync(outputPath, outputText, "utf-8");

    const stat = fs.statSync(outputPath);
    const durationMs = Date.now() - startTime;
    const mimeType = TARGET_FORMAT_MIME[cleanTarget] || "text/plain";

    return {
      outputBytes: stat.size,
      mimeType,
      outputPath,
      durationMs,
    };
  }
}
