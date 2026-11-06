// File: src/lib/downloader/media-extractor.ts

import { execFile } from "child_process";
import dns from "dns";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { MediaMetadata, MediaPlatform, MediaFormatOption } from "./types";

const execFileAsync = promisify(execFile);

export interface YtDlpCommandRunner {
  command: string;
  prefixArgs: string[];
}

let cachedWorkingRunner: YtDlpCommandRunner | null = null;

export function getYtDlpCandidateRunners(): YtDlpCommandRunner[] {
  if (cachedWorkingRunner) {
    return [cachedWorkingRunner];
  }

  const runners: YtDlpCommandRunner[] = [];
  const envYtDlp = process.env.YTDLP_PATH?.trim();
  if (envYtDlp && fs.existsSync(envYtDlp)) {
    runners.push({ command: envYtDlp, prefixArgs: [] });
  }

  const envPython = process.env.PYTHON_PATH?.trim();
  if (envPython && fs.existsSync(envPython)) {
    runners.push({ command: envPython, prefixArgs: ["-m", "yt_dlp"] });
  }

  if (process.platform !== "win32") {
    const home = os.homedir();
    const diskBins = [
      path.join(home, "bin", "yt-dlp"),
      path.join(home, ".local", "bin", "yt-dlp"),
      "/usr/local/bin/yt-dlp",
      "/usr/bin/yt-dlp",
    ];
    for (const candidate of diskBins) {
      if (fs.existsSync(candidate)) {
        runners.push({ command: candidate, prefixArgs: [] });
      }
    }
    runners.push(
      { command: "yt-dlp", prefixArgs: [] },
      { command: "python3", prefixArgs: ["-m", "yt_dlp"] },
      { command: "python", prefixArgs: ["-m", "yt_dlp"] }
    );
  } else {
    runners.push(
      { command: "python", prefixArgs: ["-m", "yt_dlp"] },
      { command: "yt-dlp", prefixArgs: [] }
    );
  }

  return runners;
}

export function markWorkingYtDlpRunner(runner: YtDlpCommandRunner): void {
  cachedWorkingRunner = runner;
}

const BLOCKED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "::",
  "169.254.169.254",
  "100.100.100.200",
  "metadata.google.internal",
  "metadata",
];

const BLOCKED_TLDS = [".localhost", ".local", ".internal", ".arpa", ".home", ".lan"];

function isBlockedIpv4Octets(a: number, b: number, c: number, d: number): boolean {
  if (
    [a, b, c, d].some(
      (n) => Number.isNaN(n) || !Number.isInteger(n) || n < 0 || n > 255
    )
  ) {
    return true;
  }
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF / TEST-NET-1
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // Multicast & broadcast (224.0.0.0/4 - 255.255.255.255)
  return false;
}

function isBlockedIpv4Pair16(hi16: number, lo16: number): boolean {
  return isBlockedIpv4Octets(
    (hi16 >> 8) & 0xff,
    hi16 & 0xff,
    (lo16 >> 8) & 0xff,
    lo16 & 0xff
  );
}

function parseIpv6Groups(rawIpv6: string): number[] | null {
  const withoutZone = rawIpv6.split("%")[0]?.trim().toLowerCase() ?? "";
  if (!withoutZone) return null;

  let working = withoutZone;
  // Normalize trailing dotted IPv4 (e.g. ::ffff:127.0.0.1) into two 16-bit hex groups
  const trailingV4 = working.match(/:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (trailingV4) {
    const o1 = Number(trailingV4[1]);
    const o2 = Number(trailingV4[2]);
    const o3 = Number(trailingV4[3]);
    const o4 = Number(trailingV4[4]);
    if ([o1, o2, o3, o4].some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      return null;
    }
    const gHigh = ((o1 << 8) | o2).toString(16);
    const gLow = ((o3 << 8) | o4).toString(16);
    working =
      working.slice(0, working.length - trailingV4[0].length) +
      `:${gHigh}:${gLow}`;
  }

  const doubleColonParts = working.split("::");
  if (doubleColonParts.length > 2) {
    return null;
  }

  const parseSegmentList = (part: string): number[] | null => {
    if (!part) return [];
    const tokens = part.split(":");
    const nums: number[] = [];
    for (const tok of tokens) {
      if (!/^[0-9a-f]{1,4}$/i.test(tok)) {
        return null;
      }
      nums.push(parseInt(tok, 16));
    }
    return nums;
  };

  if (doubleColonParts.length === 2) {
    const left = parseSegmentList(doubleColonParts[0] ?? "");
    const right = parseSegmentList(doubleColonParts[1] ?? "");
    if (!left || !right) return null;
    const missing = 8 - (left.length + right.length);
    if (missing < 1) return null;
    return [...left, ...new Array<number>(missing).fill(0), ...right];
  }

  const full = parseSegmentList(working);
  if (!full || full.length !== 8) {
    return null;
  }
  return full;
}

export function isBlockedIpHost(rawHost: string): boolean {
  const host = rawHost.replace(/^\[|\]$/g, "").toLowerCase();

  // Reject numeric/hex single-integer IP tricks (e.g. 2130706433, 0x7f000001) or octal octets
  if (/^(?:0x[0-9a-f]+|\d+)$/i.test(host)) {
    return true;
  }
  if (/^0\d+(?:\.|$)/.test(host)) {
    return true;
  }

  // Standard dotted IPv4
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    return isBlockedIpv4Octets(
      Number(ipv4Match[1]),
      Number(ipv4Match[2]),
      Number(ipv4Match[3]),
      Number(ipv4Match[4])
    );
  }

  // Canonical 128-bit IPv6 validation (fail-closed on malformed IPv6)
  if (host.includes(":")) {
    const g = parseIpv6Groups(host);
    if (!g || g.length !== 8) {
      return true;
    }

    const g0 = g[0]!;
    const g1 = g[1]!;
    const g2 = g[2]!;
    const g3 = g[3]!;
    const g4 = g[4]!;
    const g5 = g[5]!;
    const g6 = g[6]!;
    const g7 = g[7]!;

    const firstFiveZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;

    // Unspecified :: (0:0:0:0:0:0:0:0) & Loopback ::1 (0:0:0:0:0:0:0:1)
    if (firstFiveZero && g5 === 0 && g6 === 0 && (g7 === 0 || g7 === 1)) {
      return true;
    }

    // IPv4-mapped ::ffff:w.x.y.z & IPv4-compatible ::w.x.y.z
    if (firstFiveZero && (g5 === 0xffff || g5 === 0)) {
      return isBlockedIpv4Pair16(g6, g7);
    }

    // IPv4-translated ::ffff:0:w.x.y.z (RFC 2765 SIIT)
    if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0xffff && g5 === 0) {
      return isBlockedIpv4Pair16(g6, g7);
    }

    // NAT64 well-known prefix 64:ff9b::/96 & 64:ff9b:1::/48
    if (g0 === 0x0064 && g1 === 0xff9b) {
      return isBlockedIpv4Pair16(g6, g7);
    }

    // 6to4 prefix 2002::/16 (embeds IPv4 in groups 1 and 2)
    if (g0 === 0x2002) {
      return isBlockedIpv4Pair16(g1, g2);
    }

    // Teredo 2001:0000::/32 (obfuscated client IPv4 in ~g6, ~g7)
    if (g0 === 0x2001 && g1 === 0x0000) {
      return isBlockedIpv4Pair16(g6 ^ 0xffff, g7 ^ 0xffff);
    }

    // Documentation 2001:db8::/32 & ORCHID 2001:10::/28
    if (g0 === 0x2001 && (g1 === 0x0db8 || (g1 & 0xfff0) === 0x0010)) {
      return true;
    }

    // Discard-only prefix 100::/64 (RFC 6666)
    if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) {
      return true;
    }

    // Unique local fc00::/7, Link-local fe80::/10, Site-local fec0::/10, Multicast ff00::/8
    if (
      (g0 & 0xfe00) === 0xfc00 ||
      (g0 & 0xffc0) === 0xfe80 ||
      (g0 & 0xffc0) === 0xfec0 ||
      (g0 & 0xff00) === 0xff00
    ) {
      return true;
    }
  }

  return false;
}

export function validateSafeUrl(rawUrl: string): {
  valid: boolean;
  error?: string;
  url?: URL;
} {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, error: "Tautan URL tidak boleh kosong." };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) {
    return { valid: false, error: "Format URL tidak valid atau terlalu panjang." };
  }

  if (trimmed.startsWith("-")) {
    return { valid: false, error: "Format URL tidak valid (SSRF Guard)." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: "Format URL tidak valid." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      valid: false,
      error: "Hanya protokol HTTP dan HTTPS yang diizinkan.",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: "Tautan dengan kredensial tertanam tidak diizinkan (SSRF Guard).",
    };
  }

  const cleanHost = parsed.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");

  if (!cleanHost) {
    return { valid: false, error: "Nama host URL tidak valid." };
  }

  for (const blocked of BLOCKED_HOSTS) {
    if (cleanHost === blocked || cleanHost.endsWith(`.${blocked}`)) {
      return {
        valid: false,
        error: "Akses ke jaringan lokal atau privat ditolak (SSRF Guard).",
      };
    }
  }

  for (const tld of BLOCKED_TLDS) {
    if (cleanHost.endsWith(tld)) {
      return {
        valid: false,
        error: "Akses ke domain internal ditolak (SSRF Guard).",
      };
    }
  }

  if (isBlockedIpHost(cleanHost)) {
    return {
      valid: false,
      error: "Akses ke alamat IP privat atau loopback ditolak (SSRF Guard).",
    };
  }

  return { valid: true, url: parsed };
}

/**
 * Performs static URL validation AND resolves DNS records (A/AAAA) to prevent
 * DNS Rebinding attacks pointing a public domain name to 127.0.0.1 / 169.254.169.254 / 10.x.x.x.
 */
export async function validateSafeUrlWithDns(
  rawUrl: string,
  options?: {
    customLookup?: (hostname: string) => Promise<Array<{ address: string }>>;
  }
): Promise<{
  valid: boolean;
  error?: string;
  url?: URL;
}> {
  const staticCheck = validateSafeUrl(rawUrl);
  if (!staticCheck.valid || !staticCheck.url) {
    return staticCheck;
  }

  const cleanHost = staticCheck.url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");

  // If already an IP literal, staticCheck already verified it
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(cleanHost) || cleanHost.includes(":")) {
    return staticCheck;
  }

  try {
    const lookupFn =
      options?.customLookup ||
      ((host: string) => dns.promises.lookup(host, { all: true }));
    const records = await lookupFn(cleanHost);
    if (!records || records.length === 0) {
      return {
        valid: false,
        error: "Nama host URL tidak dapat diresolusi (DNS Lookup Failed).",
      };
    }

    for (const rec of records) {
      if (!rec.address || isBlockedIpHost(rec.address)) {
        return {
          valid: false,
          error:
            "Resolusi DNS mengarah ke alamat IP privat atau internal yang diblokir (DNS Rebinding SSRF Guard).",
        };
      }
    }
  } catch {
    return {
      valid: false,
      error: "Gagal memverifikasi alamat DNS host tujuan.",
    };
  }

  return staticCheck;
}

export function detectPlatform(url: URL): {
  platform: MediaPlatform;
  platformName: string;
} {
  const host = url.hostname.toLowerCase();

  if (host.includes("youtube.com") || host.includes("youtu.be")) {
    return { platform: "youtube", platformName: "YouTube" };
  }
  if (host.includes("tiktok.com")) {
    return { platform: "tiktok", platformName: "TikTok" };
  }
  if (host.includes("instagram.com")) {
    return { platform: "instagram", platformName: "Instagram" };
  }
  if (host.includes("twitter.com") || host.includes("x.com")) {
    return { platform: "twitter", platformName: "X / Twitter" };
  }
  if (host.includes("facebook.com") || host.includes("fb.watch")) {
    return { platform: "facebook", platformName: "Facebook" };
  }

  return { platform: "generic", platformName: "Web Video" };
}

export function extractYouTubeVideoId(url: URL): string {
  const host = url.hostname.toLowerCase();
  if (host.includes("youtu.be")) {
    return url.pathname.replace(/^\/+/, "").split("/")[0] || "";
  }
  const queryV = url.searchParams.get("v");
  if (queryV) return queryV;

  const pathMatch = url.pathname.match(
    /^\/(?:shorts|live|embed|v)\/([A-Za-z0-9_-]{6,})/i
  );
  return pathMatch && pathMatch[1] ? pathMatch[1] : "";
}

function formatDurationSeconds(totalSec: number): string {
  const safeSec = Math.max(0, Math.round(totalSec));
  const hours = Math.floor(safeSec / 3600);
  const minutes = Math.floor((safeSec % 3600) / 60);
  const seconds = safeSec % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0"
    )}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatApproxMegabytes(bytes: number): string {
  if (bytes <= 0) return "~";
  if (bytes < 1024 * 1024) {
    return `${Math.max(100, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface YtDlpJsonInfo {
  title?: string;
  uploader?: string;
  channel?: string;
  thumbnail?: string;
  duration?: number;
  formats?: Array<{
    ext?: string;
    height?: number;
    abr?: number;
    tbr?: number;
    vcodec?: string;
    acodec?: string;
    filesize?: number;
    filesize_approx?: number;
  }>;
}

async function probeYtDlpMetadata(
  targetUrl: string,
  platform: MediaPlatform
): Promise<YtDlpJsonInfo | null> {
  const coreFlags = [
    "--dump-single-json",
    "--no-playlist",
    "--no-warnings",
    "--no-exec",
    "--max-redirections",
    "3",
  ];

  const needsBrowserImpersonation =
    platform === "tiktok" || platform === "instagram" || platform === "twitter";

  const modeFlagSets: string[][] = needsBrowserImpersonation
    ? [
        [...coreFlags, "--impersonate", "chrome", "--", targetUrl],
        [...coreFlags, "--", targetUrl],
      ]
    : [
        [...coreFlags, "--", targetUrl],
        [...coreFlags, "--impersonate", "chrome", "--", targetUrl],
      ];

  const runners = getYtDlpCandidateRunners();

  for (const runner of runners) {
    for (const flags of modeFlagSets) {
      try {
        const { stdout } = await execFileAsync(
          runner.command,
          [...runner.prefixArgs, ...flags],
          {
            timeout: 12000,
            maxBuffer: 12 * 1024 * 1024,
          }
        );
        if (stdout && stdout.trim().startsWith("{")) {
          markWorkingYtDlpRunner(runner);
          return JSON.parse(stdout) as YtDlpJsonInfo;
        }
      } catch {
        // Try next fallback strategy
      }
    }
  }

  return null;
}

export async function extractMediaMetadata(
  targetUrl: string,
  options?: { liveProbe?: boolean }
): Promise<MediaMetadata> {
  const validation = validateSafeUrl(targetUrl);
  if (!validation.valid || !validation.url) {
    throw new Error(validation.error || "URL tidak valid.");
  }

  const isTestEnv = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
  const shouldLiveProbe = options?.liveProbe === true || !isTestEnv;

  if (shouldLiveProbe) {
    const dnsCheck = await validateSafeUrlWithDns(targetUrl);
    if (!dnsCheck.valid) {
      throw new Error(dnsCheck.error || "URL ditolak oleh pemeriksaan DNS SSRF.");
    }
  }

  const url = validation.url;
  const { platform, platformName } = detectPlatform(url);

  let title = "Media Video";
  let author = "Kreator Konten";
  let thumbnailUrl = "";
  let durationSeconds = 180;

  if (platform === "youtube") {
    const videoId = extractYouTubeVideoId(url);
    if (videoId) {
      thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      title = `YouTube Video (${videoId})`;
    }
  } else if (platform === "tiktok") {
    const userMatch = url.pathname.match(/@([^/]+)/);
    const videoMatch = url.pathname.match(/video\/(\d+)/);
    const username = userMatch ? `@${userMatch[1]}` : "TikTok Creator";
    author = username;
    title = videoMatch ? `TikTok Video (${username})` : "TikTok Video";
  } else if (platform === "instagram") {
    const reelMatch = url.pathname.match(/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
    const reelId = reelMatch ? reelMatch[1] : "";
    title = reelId ? `Instagram Reel (${reelId})` : "Instagram Reel / Post";
    author = "Instagram Creator";
  } else if (platform === "twitter") {
    const tweetMatch = url.pathname.match(/status\/(\d+)/);
    const userMatch = url.pathname.match(/^\/([^/]+)/);
    const username =
      userMatch && userMatch[1] !== "i" ? `@${userMatch[1]}` : "Pengguna X";
    author = username;
    title = tweetMatch ? `Postingan X (${username})` : "Postingan X";
  }

  let probedInfo: YtDlpJsonInfo | null = null;
  if (shouldLiveProbe) {
    probedInfo = await probeYtDlpMetadata(url.toString(), platform);
  }

  if (probedInfo) {
    if (probedInfo.title && probedInfo.title.trim()) {
      title = probedInfo.title.trim();
    }
    if (probedInfo.uploader || probedInfo.channel) {
      author = (probedInfo.uploader || probedInfo.channel || author).trim();
    }
    if (probedInfo.thumbnail) {
      thumbnailUrl = probedInfo.thumbnail;
    }
    if (typeof probedInfo.duration === "number" && probedInfo.duration > 0) {
      durationSeconds = Math.round(probedInfo.duration);
    }
  } else if (shouldLiveProbe) {
    try {
      if (platform === "youtube") {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
          url.toString()
        )}&format=json`;
        const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const json = (await res.json()) as {
            title?: string;
            author_name?: string;
            thumbnail_url?: string;
          };
          if (json.title) title = json.title;
          if (json.author_name) author = json.author_name;
          if (json.thumbnail_url) thumbnailUrl = json.thumbnail_url;
        }
      } else if (platform === "tiktok") {
        const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(
          url.toString()
        )}`;
        const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const json = (await res.json()) as {
            title?: string;
            author_name?: string;
            thumbnail_url?: string;
          };
          if (json.title) title = json.title;
          if (json.author_name) author = json.author_name;
          if (json.thumbnail_url) thumbnailUrl = json.thumbnail_url;
        }
      }
    } catch {
      // Keep parsed URL heuristics
    }
  }

  if (!title || title.trim() === "") {
    title = `${platformName} Content`;
  }

  const durationFormatted = formatDurationSeconds(durationSeconds);
  const isTikTok = platform === "tiktok";

  const estimateBytesForHeight = (targetHeight: number, fallbackKbps: number): number => {
    if (probedInfo?.formats && probedInfo.formats.length > 0) {
      const candidates = probedInfo.formats.filter(
        (f) =>
          f.vcodec &&
          f.vcodec !== "none" &&
          typeof f.height === "number" &&
          Math.abs(f.height - targetHeight) <= 200
      );
      for (const c of candidates) {
        const sz = c.filesize || c.filesize_approx;
        if (sz && sz > 0) {
          return Math.round(sz * 1.12);
        }
      }
    }
    return Math.round((durationSeconds * fallbackKbps * 1000) / 8);
  };

  const hdBytes = estimateBytesForHeight(1080, 1250);
  const sdBytes = estimateBytesForHeight(720, 630);
  const mp3HqBytes = Math.round((durationSeconds * 320 * 1000) / 8);
  const mp3StdBytes = Math.round((durationSeconds * 128 * 1000) / 8);

  const availableFormats: MediaFormatOption[] = [
    {
      id: "mp4-hd",
      format: "mp4",
      label: isTikTok
        ? "Video MP4 1080p (Tanpa Watermark)"
        : "Video MP4 (1080p Full HD)",
      quality: isTikTok ? "1080p No-WM" : "1080p",
      approxSize: formatApproxMegabytes(hdBytes),
    },
    {
      id: "mp4-sd",
      format: "mp4",
      label: isTikTok
        ? "Video MP4 720p (Tanpa Watermark)"
        : "Video MP4 (720p Standar)",
      quality: isTikTok ? "720p No-WM" : "720p",
      approxSize: formatApproxMegabytes(sdBytes),
    },
    {
      id: "mp3-hq",
      format: "mp3",
      label: isTikTok
        ? "Audio MP3 (Sound Asli 320 kbps)"
        : "Audio MP3 (Kualitas Tinggi 320 kbps)",
      quality: "320 kbps",
      approxSize: formatApproxMegabytes(mp3HqBytes),
    },
    {
      id: "mp3-standard",
      format: "mp3",
      label: isTikTok
        ? "Audio MP3 (Sound Ringkas 128 kbps)"
        : "Audio MP3 (Ukuran Ringkas 128 kbps)",
      quality: "128 kbps",
      approxSize: formatApproxMegabytes(mp3StdBytes),
    },
  ];

  return {
    url: url.toString(),
    platform,
    platformName,
    title,
    thumbnailUrl,
    durationSeconds,
    durationFormatted,
    author,
    availableFormats,
  };
}
