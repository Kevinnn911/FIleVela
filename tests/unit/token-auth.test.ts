// File: tests/unit/token-auth.test.ts

import { describe, it, expect } from 'vitest';
import {
  generateOwnerToken,
  verifyOwnerToken,
  extractTokenFromRequest,
} from '@/lib/security/token-auth';

describe('Token Security and Owner Authorization', () => {
  it('should generate 64-char token and SHA-256 hash', () => {
    const { token, hash } = generateOwnerToken();
    expect(token).toHaveLength(64);
    expect(hash).toHaveLength(64);
    expect(verifyOwnerToken(token, hash)).toBe(true);
  });

  it('should reject invalid or mismatched tokens', () => {
    const { token, hash } = generateOwnerToken();
    const wrongToken = '0'.repeat(64);
    expect(verifyOwnerToken(wrongToken, hash)).toBe(false);
    expect(verifyOwnerToken('', hash)).toBe(false);
    expect(verifyOwnerToken('short-token', hash)).toBe(false);
    expect(verifyOwnerToken(token + 'extra', hash)).toBe(false);
    expect(verifyOwnerToken(null, hash)).toBe(false);
    expect(verifyOwnerToken(undefined, hash)).toBe(false);
  });

  it('should extract token from X-Session-Token header', () => {
    const { token } = generateOwnerToken();
    const req = new Request('http://localhost:3000/api/jobs/123', {
      headers: { 'X-Session-Token': token },
    });
    expect(extractTokenFromRequest(req)).toBe(token);
  });

  it('should extract token from X-Job-Token header', () => {
    const { token } = generateOwnerToken();
    const req = new Request('http://localhost:3000/api/jobs/123', {
      headers: { 'X-Job-Token': token },
    });
    expect(extractTokenFromRequest(req)).toBe(token);
  });

  it('should extract token from Bearer authorization header', () => {
    const { token } = generateOwnerToken();
    const req = new Request('http://localhost:3000/api/jobs/123', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(extractTokenFromRequest(req)).toBe(token);
  });

  it('should extract token from query param ?token=', () => {
    const { token } = generateOwnerToken();
    const req = new Request(`http://localhost:3000/api/jobs/123/download?token=${token}`);
    expect(extractTokenFromRequest(req)).toBe(token);
  });

  it('should return null when no valid token is provided', () => {
    const req1 = new Request('http://localhost:3000/api/jobs/123');
    expect(extractTokenFromRequest(req1)).toBeNull();

    const req2 = new Request('http://localhost:3000/api/jobs/123?token=invalid_short');
    expect(extractTokenFromRequest(req2)).toBeNull();
  });

  describe('Case-Insensitive Bearer and Stored Hash Safety Guard Regressions', () => {
    it('should extract token from Bearer authorization header case-insensitively', () => {
      const { token } = generateOwnerToken();

      // Lowercase "bearer"
      const reqLower = new Request('http://localhost:3000/api/jobs/123', {
        headers: { Authorization: `bearer ${token}` },
      });
      expect(extractTokenFromRequest(reqLower)).toBe(token);

      // Uppercase "BEARER"
      const reqUpper = new Request('http://localhost:3000/api/jobs/123', {
        headers: { Authorization: `BEARER ${token}` },
      });
      expect(extractTokenFromRequest(reqUpper)).toBe(token);

      // Mixed case "bEaReR" with whitespace
      const reqMixed = new Request('http://localhost:3000/api/jobs/123', {
        headers: { Authorization: `bEaReR   ${token}` },
      });
      expect(extractTokenFromRequest(reqMixed)).toBe(token);
    });

    it('should safely return false when storedHash is missing, null, undefined, or invalid without throwing', () => {
      const { token } = generateOwnerToken();

      expect(verifyOwnerToken(token, null as unknown as string)).toBe(false);
      expect(verifyOwnerToken(token, undefined as unknown as string)).toBe(false);
      expect(verifyOwnerToken(token, '')).toBe(false);
      expect(verifyOwnerToken(token, 'short_hash')).toBe(false);
      expect(verifyOwnerToken(token, 'g'.repeat(64))).toBe(false);
      expect(verifyOwnerToken(token, 12345 as unknown as string)).toBe(false);
      expect(verifyOwnerToken(token, {} as unknown as string)).toBe(false);
    });

    it('should safely return false when candidateToken is missing, null, or undefined', () => {
      const { hash } = generateOwnerToken();

      expect(verifyOwnerToken(null, hash)).toBe(false);
      expect(verifyOwnerToken(undefined, hash)).toBe(false);
      expect(verifyOwnerToken('', hash)).toBe(false);
      expect(verifyOwnerToken(null, null as unknown as string)).toBe(false);
      expect(verifyOwnerToken(undefined, undefined as unknown as string)).toBe(false);
    });
  });
});

