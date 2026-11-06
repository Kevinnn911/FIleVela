// File: tests/unit/mime-detector.test.ts

import { describe, it, expect } from 'vitest';
import { detectMimeType, verifyFileMime } from '@/lib/security/mime-detector';

describe('Magic Bytes MIME Detector', () => {
  it('should detect PNG header', () => {
    const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);
    const detected = detectMimeType(pngBuf);
    expect(detected?.mimeType).toBe('image/png');
    expect(detected?.format).toBe('png');
    expect(detected?.extension).toBe('.png');
  });

  it('should detect JPEG header', () => {
    const jpgBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
    const detected = detectMimeType(jpgBuf);
    expect(detected?.mimeType).toBe('image/jpeg');
    expect(detected?.format).toBe('jpg');
    expect(detected?.extension).toBe('.jpg');
  });

  it('should detect WebP header', () => {
    const webpBuf = Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ');
    const detected = detectMimeType(webpBuf);
    expect(detected?.mimeType).toBe('image/webp');
    expect(detected?.format).toBe('webp');
  });

  it('should detect PDF header', () => {
    const pdfBuf = Buffer.from('%PDF-1.7\n1 0 obj');
    const detected = detectMimeType(pdfBuf);
    expect(detected?.mimeType).toBe('application/pdf');
    expect(detected?.format).toBe('pdf');
  });

  it('should detect AVIF header', () => {
    const avifBuf = Buffer.from([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
    const detected = detectMimeType(avifBuf);
    expect(detected?.mimeType).toBe('image/avif');
    expect(detected?.format).toBe('avif');
  });

  it('should detect GIF header', () => {
    const gifBuf = Buffer.from('GIF89a\x01\x00\x01\x00');
    const detected = detectMimeType(gifBuf);
    expect(detected?.mimeType).toBe('image/gif');
    expect(detected?.format).toBe('gif');
  });

  it('should detect BMP header', () => {
    const bmpBuf = Buffer.from([0x42, 0x4d, 0, 0, 0, 0]);
    const detected = detectMimeType(bmpBuf);
    expect(detected?.mimeType).toBe('image/bmp');
    expect(detected?.format).toBe('bmp');
  });

  it('should detect TIFF header (little-endian and big-endian)', () => {
    const tiffLeBuf = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0, 0]);
    const detectedLe = detectMimeType(tiffLeBuf);
    expect(detectedLe?.mimeType).toBe('image/tiff');

    const tiffBeBuf = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0]);
    const detectedBe = detectMimeType(tiffBeBuf);
    expect(detectedBe?.mimeType).toBe('image/tiff');
  });

  it('should detect WAV header', () => {
    const wavBuf = Buffer.from('RIFF\x00\x00\x00\x00WAVEfmt ');
    const detected = detectMimeType(wavBuf);
    expect(detected?.mimeType).toBe('audio/wav');
    expect(detected?.format).toBe('wav');
  });

  it('should detect MP4 header', () => {
    const mp4Buf = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    const detected = detectMimeType(mp4Buf);
    expect(detected?.mimeType).toBe('video/mp4');
    expect(detected?.format).toBe('mp4');
  });

  it('should detect WebM header', () => {
    const webmBuf = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42]);
    const detected = detectMimeType(webmBuf);
    expect(detected?.mimeType).toBe('video/webm');
    expect(detected?.format).toBe('webm');
  });

  it('should detect MP3 header (ID3v2 and MPEG frame)', () => {
    const id3Buf = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]);
    const detectedId3 = detectMimeType(id3Buf);
    expect(detectedId3?.mimeType).toBe('audio/mpeg');
    expect(detectedId3?.format).toBe('mp3');

    const syncBuf = Buffer.from([0xff, 0xfb, 0x90, 0x64]);
    const detectedSync = detectMimeType(syncBuf);
    expect(detectedSync?.mimeType).toBe('audio/mpeg');
    expect(detectedSync?.format).toBe('mp3');
  });

  it('should detect ZIP / DOCX package', () => {
    const zipBuf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    const detectedZip = detectMimeType(zipBuf);
    expect(detectedZip?.mimeType).toBe('application/zip');
    expect(detectedZip?.format).toBe('zip');

    const docxHeader = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('word/document.xml'),
    ]);
    const detectedDocx = detectMimeType(docxHeader);
    expect(detectedDocx?.format).toBe('docx');
  });

  it('should detect SVG, JSON, and CSV text formats', () => {
    const svgBuf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');
    expect(detectMimeType(svgBuf)?.mimeType).toBe('image/svg+xml');

    const jsonBuf = Buffer.from('{"name": "test", "active": true}');
    expect(detectMimeType(jsonBuf)?.mimeType).toBe('application/json');

    const csvBuf = Buffer.from('id,name,role\n1,alice,admin\n2,bob,user\n');
    expect(detectMimeType(csvBuf)?.mimeType).toBe('text/csv');
  });

  it('should verify valid declared extensions', () => {
    const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result = verifyFileMime(pngBuf, 'png');
    expect(result.valid).toBe(true);
    expect(result.detectedFormat).toBe('png');
  });

  it('should reject spoofed file with fake extension', () => {
    const fakePng = Buffer.from('<html><body>Fake file disguised as image</body></html>');
    const result = verifyFileMime(fakePng, 'png');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  describe('verifyFileMime Full MIME Type String and Equivalence Regressions', () => {
    const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);
    const pdfBuf = Buffer.from('%PDF-1.7\n1 0 obj');
    const jpgBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
    const zipBuf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);

    it('should accept full MIME type strings (image/png, application/pdf, image/jpeg)', () => {
      const pngResult = verifyFileMime(pngBuf, 'image/png');
      expect(pngResult.valid).toBe(true);
      expect(pngResult.detectedFormat).toBe('png');
      expect(pngResult.detectedMime).toBe('image/png');

      const pdfResult = verifyFileMime(pdfBuf, 'application/pdf');
      expect(pdfResult.valid).toBe(true);
      expect(pdfResult.detectedFormat).toBe('pdf');
      expect(pdfResult.detectedMime).toBe('application/pdf');

      const jpgResult = verifyFileMime(jpgBuf, 'image/jpeg');
      expect(jpgResult.valid).toBe(true);
      expect(jpgResult.detectedFormat).toBe('jpg');
    });

    it('should handle case-insensitivity and whitespace in declared MIME type or extension', () => {
      expect(verifyFileMime(pngBuf, '  IMAGE/PNG  ').valid).toBe(true);
      expect(verifyFileMime(pngBuf, 'image/PNG').valid).toBe(true);
      expect(verifyFileMime(pdfBuf, '  APPLICATION/PDF \n').valid).toBe(true);
      expect(verifyFileMime(pngBuf, '.PNG').valid).toBe(true);
      expect(verifyFileMime(jpgBuf, 'JPEG').valid).toBe(true);
      expect(verifyFileMime(jpgBuf, '.JPG').valid).toBe(true);
    });

    it('should reject mismatched MIME types correctly', () => {
      const mismatch1 = verifyFileMime(pngBuf, 'application/pdf');
      expect(mismatch1.valid).toBe(false);
      expect(mismatch1.detectedFormat).toBe('png');
      expect(mismatch1.error).toContain('image/png');

      const mismatch2 = verifyFileMime(pdfBuf, 'image/png');
      expect(mismatch2.valid).toBe(false);
      expect(mismatch2.error).toBeDefined();

      const mismatch3 = verifyFileMime(pngBuf, 'application/x-executable');
      expect(mismatch3.valid).toBe(false);
    });

    it('should accept zip equivalence for zip-based packages', () => {
      const zipResult = verifyFileMime(zipBuf, 'application/zip');
      expect(zipResult.valid).toBe(true);
      expect(zipResult.detectedFormat).toBe('zip');
    });

    it('should handle invalid or empty declared format safely without crashing', () => {
      expect(verifyFileMime(pngBuf, '').valid).toBe(false);
      expect(verifyFileMime(pngBuf, null as unknown as string).valid).toBe(false);
      expect(verifyFileMime(pngBuf, undefined as unknown as string).valid).toBe(false);
    });

    it('should correctly normalize and accept formats with leading whitespace combined with leading dot', () => {
      // Defect 2 remediation: verify that leading spaces before dots are stripped correctly
      expect(verifyFileMime(pngBuf, ' .png ').valid).toBe(true);
      expect(verifyFileMime(pngBuf, '   .PNG   ').valid).toBe(true);
      expect(verifyFileMime(jpgBuf, '  .jpg  ').valid).toBe(true);
      expect(verifyFileMime(jpgBuf, '  .jpeg  ').valid).toBe(true);
      expect(verifyFileMime(pdfBuf, ' \t.pdf \n').valid).toBe(true);
      expect(verifyFileMime(zipBuf, '  .zip  ').valid).toBe(true);
    });

    it('should handle multi-dot and trailing dot format edge cases gracefully', () => {
      expect(verifyFileMime(pngBuf, '..png').valid).toBe(true);
      expect(verifyFileMime(pngBuf, 'png.').valid).toBe(true);
      expect(verifyFileMime(pngBuf, ' .png. ').valid).toBe(true);
      expect(verifyFileMime(jpgBuf, '..jpg').valid).toBe(true);
    });

    it('should continue to reject spoofed files even when declared format has leading whitespace and leading dot', () => {
      const fakePng = Buffer.from('<html><body>not a real png</body></html>');
      const resPng = verifyFileMime(fakePng, ' .png ');
      expect(resPng.valid).toBe(false);

      const fakeJpg = Buffer.from('%PDF-1.7 not a jpeg image');
      const resJpg = verifyFileMime(fakeJpg, '  .jpg  ');
      expect(resJpg.valid).toBe(false);
    });
  });
});

