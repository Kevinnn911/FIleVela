// File: src/lib/adapters/ffmpeg-media.ts

import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import {
  ConversionResult,
  ConversionTarget,
  FileCategory,
  IConversionAdapter,
} from "./types";

const execFileAsync = promisify(execFile);

const TARGET_FORMAT_MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  aac: "audio/aac",
};

const TARGET_FORMAT_LABELS: Record<string, string> = {
  mp4: "MP4 (MPEG-4 Video H.264)",
  webm: "WebM (VP9 Video / Opus)",
  mp3: "MP3 (MPEG-1 Audio Layer 3)",
  wav: "WAV (Waveform PCM Audio)",
  ogg: "OGG (Ogg Vorbis Audio)",
  flac: "FLAC (Free Lossless Audio Codec)",
  m4a: "M4A (MPEG-4 AAC Audio)",
  aac: "AAC (Advanced Audio Coding)",
};

const AUDIO_FORMATS = ["mp3", "wav", "ogg", "flac", "m4a", "aac"];
const VIDEO_FORMATS = ["mp4", "webm"];
const ALLOWED_MEDIA_FORMATS = new Set([...VIDEO_FORMATS, ...AUDIO_FORMATS]);
const FFMPEG_TIMEOUT_MS = 60000;

function findCandidateFfmpegOnDisk(): string | null {
  const envPath = process.env.FFMPEG_PATH?.trim();
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  if (process.platform !== "win32") {
    const home = os.homedir();
    const candidates = [
      path.join(home, "bin", "ffmpeg"),
      path.join(home, ".local", "bin", "ffmpeg"),
      "/usr/local/bin/ffmpeg",
      "/usr/bin/ffmpeg",
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

export class FFmpegMediaAdapter implements IConversionAdapter {
  public readonly id: string = "ffmpeg-media";
  public readonly name: string = "FFmpeg Media Converter Engine";
  public readonly category: FileCategory = "video";

  private supportedSources: string[] = [...VIDEO_FORMATS, ...AUDIO_FORMATS];
  private binaryPath: string | null = null;
  private ffprobePath: string | null = null;
  private hasCheckedAvailability: boolean = false;
  private isAvailableCache: boolean = false;

  public async isAvailable(): Promise<boolean> {
    if (this.hasCheckedAvailability) {
      return this.isAvailableCache;
    }

    const diskCandidate = findCandidateFfmpegOnDisk();
    if (diskCandidate) {
      this.binaryPath = diskCandidate;
      const envProbe = process.env.FFPROBE_PATH?.trim();
      const siblingProbe = path.join(
        path.dirname(diskCandidate),
        process.platform === "win32" ? "ffprobe.exe" : "ffprobe"
      );
      if (envProbe && fs.existsSync(envProbe)) {
        this.ffprobePath = envProbe;
      } else if (fs.existsSync(siblingProbe)) {
        this.ffprobePath = siblingProbe;
      } else {
        this.ffprobePath = "ffprobe";
      }
      this.isAvailableCache = true;
      this.hasCheckedAvailability = true;
      return true;
    }

    try {
      const probeCmd = process.platform === "win32" ? "where" : "which";
      const { stdout } = await execFileAsync(probeCmd, ["ffmpeg"]);
      if (stdout && stdout.trim().length > 0) {
        const resolved = stdout.trim().split(/\r?\n/)[0] || "ffmpeg";
        this.binaryPath = resolved;
        const siblingProbe = path.join(
          path.dirname(resolved),
          process.platform === "win32" ? "ffprobe.exe" : "ffprobe"
        );
        if (fs.existsSync(siblingProbe)) {
          this.ffprobePath = siblingProbe;
        } else {
          this.ffprobePath = "ffprobe";
        }
        this.isAvailableCache = true;
      } else {
        this.isAvailableCache = false;
      }
    } catch {
      this.isAvailableCache = false;
    }

    this.hasCheckedAvailability = true;
    return this.isAvailableCache;
  }

  public getSetupInstructions(): string {
    return "FFmpeg belum terpasang atau executable 'ffmpeg' tidak ditemukan dalam PATH sistem. Untuk mengaktifkan konversi video & audio, silakan unduh FFmpeg dari https://ffmpeg.org dan tambahkan direktori bin ke PATH sistem (atau ~/bin pada cPanel).";
  }

  public getSupportedSources(): string[] {
    return [...this.supportedSources];
  }

  public async getSupportedTargets(sourceFormat: string): Promise<ConversionTarget[]> {
    const isAvail = await this.isAvailable();
    const cleanSource = sourceFormat.toLowerCase().replace(/^\.+/, "");
    const targets: ConversionTarget[] = [];

    const isAudio = AUDIO_FORMATS.includes(cleanSource);

    const candidateTargets = isAudio
      ? AUDIO_FORMATS.filter((t) => t !== cleanSource)
      : [...VIDEO_FORMATS, ...AUDIO_FORMATS].filter((t) => t !== cleanSource);

    for (const target of candidateTargets) {
      targets.push({
        targetFormat: target,
        label: TARGET_FORMAT_LABELS[target] || target.toUpperCase(),
        mimeType: TARGET_FORMAT_MIME[target] || "application/octet-stream",
        adapterId: this.id,
        isAvailable: isAvail,
        statusReason: isAvail ? undefined : this.getSetupInstructions(),
      });
    }

    return targets;
  }

  private async hasAudioStream(inputPath: string): Promise<boolean> {
    const probeBin = this.ffprobePath || "ffprobe";
    try {
      const { stdout } = await execFileAsync(
        probeBin,
        [
          "-v",
          "error",
          "-select_streams",
          "a",
          "-show_entries",
          "stream=codec_type",
          "-of",
          "csv=p=0",
          inputPath,
        ],
        {
          timeout: 15000,
          maxBuffer: 2 * 1024 * 1024,
        }
      );
      return stdout.trim().length > 0;
    } catch {
      return true;
    }
  }

  public async convert(
    inputPath: string,
    outputPath: string,
    sourceFormat: string,
    targetFormat: string
  ): Promise<ConversionResult> {
    const isAvail = await this.isAvailable();
    if (!isAvail) {
      throw new Error(this.getSetupInstructions());
    }

    if (!fs.existsSync(inputPath)) {
      throw new Error(`File sumber tidak ditemukan pada: ${inputPath}`);
    }

    const cleanSource = sourceFormat.toLowerCase().replace(/^\.+/, "");
    const cleanTarget = targetFormat.toLowerCase().replace(/^\.+/, "");

    if (!ALLOWED_MEDIA_FORMATS.has(cleanSource) || !ALLOWED_MEDIA_FORMATS.has(cleanTarget)) {
      throw new Error(`Format media tidak diizinkan oleh kebijakan keamanan: ${cleanSource} -> ${cleanTarget}`);
    }

    const startTime = Date.now();
    const binary = this.binaryPath || "ffmpeg";

    if (VIDEO_FORMATS.includes(cleanSource) && AUDIO_FORMATS.includes(cleanTarget)) {
      const hasAudio = await this.hasAudioStream(inputPath);
      if (!hasAudio) {
        throw new Error(
          "Video sumber tidak memiliki jalur audio (silent video) sehingga tidak dapat diekstrak menjadi berkas audio."
        );
      }
    }

    const args: string[] = [
      "-y",
      "-protocol_whitelist",
      "file,pipe,crypto,data",
      "-i",
      inputPath,
    ];

    if (cleanTarget === "mp4") {
      args.push(
        "-vf",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart"
      );
    } else if (cleanTarget === "webm") {
      args.push(
        "-c:v",
        "libvpx-vp9",
        "-crf",
        "33",
        "-b:v",
        "0",
        "-deadline",
        "good",
        "-cpu-used",
        "4",
        "-c:a",
        "libopus",
        "-b:a",
        "128k"
      );
    } else if (cleanTarget === "mp3") {
      args.push("-vn", "-c:a", "libmp3lame", "-q:a", "2");
    } else if (cleanTarget === "wav") {
      args.push("-vn", "-c:a", "pcm_s16le");
    } else if (cleanTarget === "ogg") {
      args.push("-vn", "-c:a", "libvorbis", "-q:a", "5");
    } else if (cleanTarget === "flac") {
      args.push("-vn", "-c:a", "flac");
    } else if (cleanTarget === "m4a") {
      args.push("-vn", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart");
    } else if (cleanTarget === "aac") {
      args.push("-vn", "-c:a", "aac", "-b:a", "192k", "-f", "adts");
    }

    args.push(outputPath);

    await execFileAsync(binary, args, {
      timeout: FFMPEG_TIMEOUT_MS,
      maxBuffer: 20 * 1024 * 1024,
    });

    if (!fs.existsSync(outputPath)) {
      throw new Error(`Gagal menghasilkan file konversi media ke: ${outputPath}`);
    }

    const stat = fs.statSync(outputPath);
    const durationMs = Date.now() - startTime;
    const mimeType = TARGET_FORMAT_MIME[cleanTarget] || "application/octet-stream";

    return {
      outputBytes: stat.size,
      mimeType,
      outputPath,
      durationMs,
    };
  }
}
