// File: tests/unit/cpanel-domain-config.test.ts

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  SITE_DOMAIN,
  SITE_NAME,
  SITE_URL,
  getCanonicalUrl,
} from "@/lib/config/site";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { getYtDlpCandidateRunners } from "@/lib/downloader/media-extractor";

describe("cPanel Hosting & Domain Configuration (filevela.biz.id)", () => {
  it("menetapkan domain produksi utama filevela.biz.id dan URL kanonis HTTPS", () => {
    expect(SITE_NAME).toBe("FileVela");
    expect(SITE_DOMAIN).toBe("filevela.biz.id");
    expect(SITE_URL).toBe("https://filevela.biz.id");
    expect(getCanonicalUrl("/")).toBe("https://filevela.biz.id/");
    expect(getCanonicalUrl("/docs")).toBe("https://filevela.biz.id/docs");
    expect(getCanonicalUrl("privacy")).toBe("https://filevela.biz.id/privacy");
  });

  it("menghasilkan konfigurasi robots.txt yang merujuk ke https://filevela.biz.id", () => {
    const robotsConfig = robots();
    expect(robotsConfig.host).toBe("https://filevela.biz.id");
    expect(robotsConfig.sitemap).toBe("https://filevela.biz.id/sitemap.xml");
  });

  it("menghasilkan daftar URL sitemap.xml untuk seluruh halaman publik filevela.biz.id", () => {
    const entries = sitemap();
    const urls = entries.map((item) => item.url);
    expect(urls).toContain("https://filevela.biz.id/");
    expect(urls).toContain("https://filevela.biz.id/docs");
    expect(urls).toContain("https://filevela.biz.id/privacy");
    expect(urls).toContain("https://filevela.biz.id/terms");
  });

  it("menyediakan berkas startup server.js, app.js, dan template .htaccess untuk Phusion Passenger cPanel", () => {
    const rootDir = process.cwd();
    expect(fs.existsSync(path.join(rootDir, "server.js"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, "app.js"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, ".env.production.example"))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, ".htaccess.cpanel.example"))).toBe(true);

    const serverJsContent = fs.readFileSync(path.join(rootDir, "server.js"), "utf8");
    expect(serverJsContent).toContain("filevela.biz.id");
    expect(serverJsContent).toContain("http.createServer");
  });

  it("menyediakan kandidat runner yt-dlp lintas platform (Linux cPanel & Windows)", () => {
    const runners = getYtDlpCandidateRunners();
    expect(runners.length).toBeGreaterThan(0);
    expect(runners[0]?.command).toBeTruthy();
  });
});

