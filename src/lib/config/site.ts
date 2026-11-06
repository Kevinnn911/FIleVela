// File: src/lib/config/site.ts

export const SITE_NAME = "FileVela";
export const SITE_DOMAIN =
  process.env.NEXT_PUBLIC_SITE_DOMAIN?.trim() || "filevela.biz.id";

function normalizeSiteUrl(rawUrl?: string): string {
  const fallback = `https://${SITE_DOMAIN}`;
  if (!rawUrl || rawUrl.trim().length === 0) {
    return fallback;
  }
  const trimmed = rawUrl.trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

export function getCanonicalUrl(pathname = "/"): string {
  const cleanPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${SITE_URL}${cleanPath}`;
}

