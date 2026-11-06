// File: src/lib/downloader/types.ts

export type MediaPlatform =
  | "youtube"
  | "tiktok"
  | "instagram"
  | "twitter"
  | "facebook"
  | "generic";

export interface MediaFormatOption {
  id: string;
  format: "mp4" | "mp3";
  label: string;
  quality: string;
  approxSize: string;
}

export interface MediaMetadata {
  url: string;
  platform: MediaPlatform;
  platformName: string;
  title: string;
  thumbnailUrl: string;
  durationSeconds?: number;
  durationFormatted?: string;
  author?: string;
  availableFormats: MediaFormatOption[];
}

