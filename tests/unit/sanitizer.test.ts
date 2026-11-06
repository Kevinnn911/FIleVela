// File: tests/unit/sanitizer.test.ts

import { describe, it, expect } from 'vitest';
import {
  sanitizeFilename,
  assertSafeJobId,
  isValidJobId,
  resolveSafePath,
} from '@/lib/storage/path-sanitizer';

describe('Path Sanitizer and Normalizer', () => {
  describe('assertSafeJobId and isValidJobId', () => {
    it('should accept valid UUID v4', () => {
      const valid = '3a28f8d2-43bb-4d51-a9f8-b80c57099a8f';
      expect(isValidJobId(valid)).toBe(true);
      expect(() => assertSafeJobId(valid)).not.toThrow();
    });

    it('should reject directory traversal attempts in jobId', () => {
      expect(isValidJobId('../../../etc')).toBe(false);
      expect(() => assertSafeJobId('..\\..\\windows')).toThrow();
      expect(() => assertSafeJobId('3a28f8d2-43bb-4d51-a9f8-b80c57099a8f/../test')).toThrow();
    });

    it('should reject non-UUID strings or empty strings', () => {
      expect(isValidJobId('')).toBe(false);
      expect(isValidJobId('12345')).toBe(false);
      expect(() => assertSafeJobId('')).toThrow();
    });
  });

  describe('sanitizeFilename', () => {
    it('should strip path traversal sequences', () => {
      expect(sanitizeFilename('../../../etc/passwd')).toBe('passwd');
      expect(sanitizeFilename('..\\..\\boot.ini')).toBe('boot.ini');
      expect(sanitizeFilename('%2e%2e%2fmalicious.png')).toBe('malicious.png');
    });

    it('should mitigate Windows reserved device names', () => {
      expect(sanitizeFilename('con.png')).toBe('_con.png');
      expect(sanitizeFilename('AUX.txt')).toBe('_AUX.txt');
      expect(sanitizeFilename('nul.pdf')).toBe('_nul.pdf');
      expect(sanitizeFilename('com1.jpg')).toBe('_com1.jpg');
    });

    it('should replace shell metacharacters and illegal characters with underscores', () => {
      expect(sanitizeFilename('foo;rm -rf;bar.png')).toBe('foo_rm -rf_bar.png');
      expect(sanitizeFilename('image|calc.jpg')).toBe('image_calc.jpg');
      expect(sanitizeFilename('bad<file>name:test.pdf')).toBe('bad_file_name_test.pdf');
    });

    it('should collapse multiple dots and strip trailing dots and spaces', () => {
      expect(sanitizeFilename('photo...png')).toBe('photo.png');
      expect(sanitizeFilename('document.pdf.  ')).toBe('document.pdf');
      expect(sanitizeFilename('...')).toBe('unnamed_file');
    });

    it('should enforce maximum length preserving extension', () => {
      const longName = 'a'.repeat(200) + '.webp';
      const sanitized = sanitizeFilename(longName);
      expect(sanitized.endsWith('.webp')).toBe(true);
      expect(sanitized.length).toBeLessThanOrEqual(125);
    });

    it('should fallback to default basename when filename is empty or invalid', () => {
      expect(sanitizeFilename('')).toBe('unnamed_file');
      expect(sanitizeFilename('   ')).toBe('unnamed_file');
    });
  });

  describe('resolveSafePath', () => {
    it('should allow valid subpaths', () => {
      const base = 'C:\\storage\\jobs\\1234';
      const resolved = resolveSafePath(base, 'input/file.png');
      expect(resolved.startsWith(base)).toBe(true);
    });

    it('should throw on path traversal attempts', () => {
      const base = 'C:\\storage\\jobs\\1234';
      expect(() => resolveSafePath(base, '../../etc/passwd')).toThrow(/Path traversal violation/);
    });
  });
});
