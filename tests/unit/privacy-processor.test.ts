// File: tests/unit/privacy-processor.test.ts

import { describe, it, expect } from 'vitest';
import {
  canProcessClientSide,
  processDataClientSide,
} from '@/lib/client/privacy-processor';

describe('Client-Side Privacy Processor Tests', () => {
  it('should accurately detect supported client-side formats', () => {
    expect(canProcessClientSide('jpg', 'png')).toBe(true);
    expect(canProcessClientSide('png', 'webp')).toBe(true);
    expect(canProcessClientSide('json', 'csv')).toBe(true);
    expect(canProcessClientSide('csv', 'json')).toBe(true);
    expect(canProcessClientSide('tsv', 'csv')).toBe(true);

    // Unsupported for pure client side without heavy WASM/server
    expect(canProcessClientSide('mp4', 'mp3')).toBe(false);
    expect(canProcessClientSide('docx', 'pdf')).toBe(false);
  });

  it('should convert CSV to JSON 100% locally', async () => {
    const csvContent = 'nama,umur,pekerjaan\nBudi,25,Programmer\nAni,28,Designer';
    const file = new File([csvContent], 'data.csv', { type: 'text/csv' });

    const result = await processDataClientSide(file, 'json');
    expect(result.filename).toBe('data.json');
    expect(result.mimeType).toBe('application/json');

    const text = await result.blob.text();
    const parsed = JSON.parse(text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].nama).toBe('Budi');
    expect(parsed[0].pekerjaan).toBe('Programmer');
  });

  it('should convert JSON to CSV 100% locally', async () => {
    const jsonContent = JSON.stringify([
      { id: 1, kota: 'Jakarta' },
      { id: 2, kota: 'Bandung' },
    ]);
    const file = new File([jsonContent], 'kota.json', { type: 'application/json' });

    const result = await processDataClientSide(file, 'csv');
    expect(result.filename).toBe('kota.csv');
    expect(result.mimeType).toBe('text/csv');

    const text = await result.blob.text();
    expect(text).toContain('"id","kota"');
    expect(text).toContain('"1","Jakarta"');
    expect(text).toContain('"2","Bandung"');
  });
});

