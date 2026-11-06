// File: src/lib/security/rate-limiter.ts

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  bucket: string;
  maxRequests: number;
  windowMs: number;
  clientIp?: string;
  forceEnforce?: boolean;
}

export type SecurityEventType =
  | "rate_limit_exceeded"
  | "invalid_mime_rejected"
  | "unauthorized_access"
  | "ssrf_blocked"
  | "zip_bomb_blocked"
  | "conversion_failed";

export interface SecurityAuditEvent {
  type: SecurityEventType;
  route: string;
  jobId?: string;
  reason: string;
  clientIp?: string;
}

interface BucketEntry {
  timestamps: number[];
}

const rateLimitStore = new Map<string, BucketEntry>();
const MAX_TRACKED_KEYS = 5000;

export function resetRateLimiterStore(): void {
  rateLimitStore.clear();
}

export function extractClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded && forwarded.trim().length > 0) {
    const first = forwarded.split(",")[0]?.trim();
    if (first && first.length <= 64) {
      return first;
    }
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp && realIp.length <= 64) {
    return realIp;
  }
  return "127.0.0.1";
}

export function checkRateLimit(
  request: Request,
  options: RateLimitOptions
): RateLimitResult {
  const isTestEnv =
    !options.forceEnforce &&
    (process.env.NODE_ENV === "test" || Boolean(process.env.VITEST));

  if (isTestEnv) {
    return {
      allowed: true,
      remaining: options.maxRequests,
      retryAfterSeconds: 0,
    };
  }

  const now = Date.now();
  const windowStart = now - options.windowMs;
  const ip = options.clientIp || extractClientIp(request);
  const key = `${options.bucket}:${ip}`;

  if (rateLimitStore.size > MAX_TRACKED_KEYS && !rateLimitStore.has(key)) {
    const oldestKey = rateLimitStore.keys().next().value;
    if (oldestKey) {
      rateLimitStore.delete(oldestKey);
    }
  }

  const entry = rateLimitStore.get(key) || { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  if (entry.timestamps.length >= options.maxRequests) {
    const oldestInWindow = entry.timestamps[0] ?? now;
    const retryAfterMs = Math.max(1000, options.windowMs - (now - oldestInWindow));
    rateLimitStore.set(key, entry);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  entry.timestamps.push(now);
  rateLimitStore.set(key, entry);

  return {
    allowed: true,
    remaining: Math.max(0, options.maxRequests - entry.timestamps.length),
    retryAfterSeconds: 0,
  };
}

const FORBIDDEN_OBJECT_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

function cleanObjectRecursive(
  input: unknown,
  depth: number
): Record<string, unknown> | undefined {
  if (depth > 4 || typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }

  const safeObj: Record<string, unknown> = {};
  const entries = Object.entries(input as Record<string, unknown>);

  for (const [key, value] of entries.slice(0, 32)) {
    if (FORBIDDEN_OBJECT_KEYS.has(key)) {
      continue;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      if (typeof value === "string" && value.length > 512) {
        safeObj[key] = value.slice(0, 512);
      } else {
        safeObj[key] = value;
      }
    } else if (Array.isArray(value)) {
      safeObj[key] = value
        .slice(0, 32)
        .filter(
          (item) =>
            typeof item === "string" ||
            typeof item === "number" ||
            typeof item === "boolean"
        );
    } else if (typeof value === "object") {
      const nested = cleanObjectRecursive(value, depth + 1);
      if (nested) {
        safeObj[key] = nested;
      }
    }
  }

  return safeObj;
}

/**
 * Safely parses and sanitizes a JSON options string or object, stripping
 * prototype pollution keys (__proto__, constructor, prototype) and bounding depth.
 */
export function sanitizeJsonOptions(
  rawInput: unknown
): Record<string, unknown> | undefined {
  if (!rawInput) {
    return undefined;
  }

  let parsed: unknown = rawInput;
  if (typeof rawInput === "string") {
    const trimmed = rawInput.trim();
    if (!trimmed || trimmed.length > 8192) {
      return undefined;
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }

  return cleanObjectRecursive(parsed, 0);
}

/**
 * Scrubs internal server file paths (Windows C:\... or POSIX /var/..., .storage/...)
 * from error messages before returning them in HTTP responses.
 */
export function sanitizePublicErrorMessage(
  rawMessage: unknown,
  fallbackMessage = "Terjadi kesalahan saat memproses permintaan."
): string {
  if (typeof rawMessage !== "string" || rawMessage.trim().length === 0) {
    return fallbackMessage;
  }

  let cleaned = rawMessage
    // Redact Windows absolute paths like C:\Best Project\Open\...
    .replace(/[A-Za-z]:\\[^\s"';)]+/g, "[jalur-internal]")
    // Redact POSIX paths containing .storage, /tmp, /var, /home, /usr, /etc
    .replace(/\/(?:var|tmp|home|usr|etc|opt|root|proc|app)[^\s"';)]*/gi, "[jalur-internal]")
    .replace(/[^\s"';)]*\.storage[^\s"';)]*/gi, "[jalur-internal]")
    .trim();

  if (cleaned.length > 360) {
    cleaned = `${cleaned.slice(0, 360)}...`;
  }

  return cleaned || fallbackMessage;
}

/**
 * Records structured security events without logging raw tokens, credentials, or file contents.
 */
export function logSecurityEvent(event: SecurityAuditEvent): void {
  if (process.env.NODE_ENV === "test" || Boolean(process.env.VITEST)) {
    return;
  }

  const record = {
    timestamp: new Date().toISOString(),
    level: "SECURITY",
    type: event.type,
    route: event.route,
    jobId: event.jobId || undefined,
    reason: sanitizePublicErrorMessage(event.reason, "Security policy violation"),
  };

  console.warn(JSON.stringify(record));
}

