// File: src/lib/storage/sharp-guard.ts

import sharp from 'sharp';

/**
 * Configures Sharp globally for Windows environments:
 * 1. Disables file and memory cache to release file locks immediately.
 * 2. Enables SIMD instructions for optimal CPU vectorization.
 */
export function configureSharp(): void {
  sharp.cache(false);
  sharp.simd(true);
}

// Auto-invoke on module load
configureSharp();
