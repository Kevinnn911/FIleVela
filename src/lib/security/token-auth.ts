// File: src/lib/security/token-auth.ts

import crypto from 'crypto';

export interface GeneratedToken {
  token: string;
  hash: string;
}

/**
 * Generates a 256-bit cryptographically secure owner token (64 hex characters)
 * and its SHA-256 hash for storage in meta.json.
 */
export function generateOwnerToken(): GeneratedToken {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = hashToken(token);
  return { token, hash };
}

/**
 * Computes the SHA-256 hash of a raw token string.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Validates a candidate token against a stored SHA-256 hash using
 * constant-time comparison to prevent timing side-channel attacks.
 *
 * @param candidateToken The raw token provided by client
 * @param storedHash The SHA-256 hash stored in job meta.json
 * @returns boolean true if authorized, false otherwise
 */
export function verifyOwnerToken(
  candidateToken: string | null | undefined,
  storedHash: string | null | undefined
): boolean {
  if (!candidateToken || typeof candidateToken !== 'string') {
    return false;
  }

  if (!storedHash || typeof storedHash !== 'string') {
    return false;
  }

  const cleanedToken = candidateToken.trim();
  // Valid token must be exactly 64 hex characters
  if (!/^[0-9a-fA-F]{64}$/.test(cleanedToken)) {
    return false;
  }

  const candidateHash = hashToken(cleanedToken);
  const candidateBuf = Buffer.from(candidateHash, 'hex');
  const storedBuf = Buffer.from(storedHash, 'hex');

  if (candidateBuf.length !== storedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidateBuf, storedBuf);
}

/**
 * Extracts the owner token from standard request headers or query parameters.
 * Checks in order:
 * 1. Header: X-Session-Token
 * 2. Header: X-Job-Token
 * 3. Header: Authorization: Bearer <token> (case-insensitive per RFC 6750 / RFC 7235)
 * 4. URL Search Param: ?token=<token>
 *
 * @param request Web standard Request
 * @returns The token string if found and valid format, or null
 */
export function extractTokenFromRequest(request: Request): string | null {
  // 1. Header: X-Session-Token
  const sessionToken = request.headers.get('x-session-token');
  if (sessionToken && /^[0-9a-fA-F]{64}$/.test(sessionToken.trim())) {
    return sessionToken.trim();
  }

  // 2. Header: X-Job-Token
  const jobToken = request.headers.get('x-job-token');
  if (jobToken && /^[0-9a-fA-F]{64}$/.test(jobToken.trim())) {
    return jobToken.trim();
  }

  // 3. Header: Authorization: Bearer <token> (case-insensitive per RFC 6750 / RFC 7235)
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    if (/^[0-9a-fA-F]{64}$/.test(bearerToken)) {
      return bearerToken;
    }
  }

  // 4. Query param: ?token=<token>
  try {
    const url = new URL(request.url);
    const queryToken = url.searchParams.get('token');
    if (queryToken && /^[0-9a-fA-F]{64}$/.test(queryToken.trim())) {
      return queryToken.trim();
    }
  } catch {
    // If URL parsing fails, ignore query token
  }

  return null;
}
