// File: src/lib/storage/path-sanitizer.ts

import path from 'path';

/**
 * Strict UUID v4 regex pattern.
 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Windows reserved device names: CON, PRN, AUX, NUL, COM1-9, LPT1-9.
 */
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Maximum safe base filename length (in characters).
 */
const MAX_BASE_NAME_LENGTH = 120;

/**
 * Validates that a jobId strictly conforms to UUID v4 format.
 * Throws an Error if invalid, preventing any path breakout via jobId.
 */
export function assertSafeJobId(jobId: string): void {
  if (!jobId || typeof jobId !== 'string' || !UUID_V4_REGEX.test(jobId.trim())) {
    throw new Error(`Invalid Job ID format: "${jobId}" is not a valid UUID v4`);
  }
}

/**
 * Checks whether a jobId conforms to UUID v4 format.
 */
export function isValidJobId(jobId: string): boolean {
  return typeof jobId === 'string' && UUID_V4_REGEX.test(jobId.trim());
}

/**
 * Sanitizes an uploaded or output filename to prevent directory traversal,
 * shell command injection, Windows device name collision, and filesystem crashes.
 */
export function sanitizeFilename(rawFilename: string, fallbackBase = 'unnamed_file'): string {
  if (!rawFilename || typeof rawFilename !== 'string') {
    return fallbackBase;
  }

  let cleaned = rawFilename;
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    // Retain original string if decoding fails
  }

  cleaned = path.basename(cleaned);
  cleaned = cleaned.replace(/[\x00-\x1f\x7f]/g, '');
  cleaned = cleaned.replace(/[<>:"/\\|?*;&$`()'^!{}[\]~]/g, '_');

  if (WINDOWS_RESERVED_NAMES.test(cleaned)) {
    cleaned = '_' + cleaned;
  }

  cleaned = cleaned.replace(/\.{2,}/g, '.');
  cleaned = cleaned.replace(/[_\s]{2,}/g, '_');
  cleaned = cleaned.replace(/^[\.\s_]+|[\.\s_]+$/g, '');

  const ext = path.extname(cleaned);
  let base = path.basename(cleaned, ext);

  if (!base) {
    base = fallbackBase;
  }

  if (base.length > MAX_BASE_NAME_LENGTH) {
    base = base.slice(0, MAX_BASE_NAME_LENGTH);
  }

  const finalName = ext ? `${base}${ext}` : base;

  if (WINDOWS_RESERVED_NAMES.test(finalName)) {
    return `_${finalName}`;
  }

  return finalName || fallbackBase;
}

/**
 * Builds an RFC 5987 compliant Content-Disposition header value that preserves
 * spaces (without literal %20 in the ASCII fallback) and supports full UTF-8 filenames.
 */
export function buildContentDispositionHeader(rawFilename: string): string {
  const clean = rawFilename.replace(/[\r\n"]/g, '').trim() || 'download';
  const asciiFallback = clean
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/[\\"]/g, '_')
    .trim() || 'download';
  const encodedUtf8 = encodeURIComponent(clean).replace(
    /['()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedUtf8}`;
}

/**
 * Resolves a relative path safely against a base directory, guaranteeing
 * that the target path does not escape the base directory (path traversal guard).
 */
export function resolveSafePath(baseDir: string, relativePath: string): string {
  const safeBase = path.resolve(baseDir);
  const resolved = path.resolve(safeBase, relativePath);

  const prefix = safeBase.endsWith(path.sep) ? safeBase : `${safeBase}${path.sep}`;
  if (resolved !== safeBase && !resolved.startsWith(prefix)) {
    throw new Error(
      `Path traversal violation: target path "${resolved}" escapes base directory "${safeBase}"`
    );
  }

  return resolved;
}
