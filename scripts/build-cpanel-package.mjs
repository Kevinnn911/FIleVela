// File: scripts/build-cpanel-package.mjs

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist-cpanel");
const outputZipPath = path.join(projectRoot, "filevela-cpanel-ready.zip");
const isolatedBuildDirName = ".next-cpanel-build";
const isolatedBuildPath = path.join(projectRoot, isolatedBuildDirName);
const tsconfigPath = path.join(projectRoot, "tsconfig.json");

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

function computeCrc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function collectFilesRecursively(baseDir, currentRel = "") {
  const results = [];
  const absDir = currentRel ? path.join(baseDir, currentRel) : baseDir;
  const entries = fs.readdirSync(absDir, { withFileTypes: true });

  for (const entry of entries) {
    const relPath = currentRel
      ? `${currentRel}/${entry.name}`
      : entry.name;
    const fullPath = path.join(absDir, entry.name);

    if (entry.isDirectory()) {
      results.push(...collectFilesRecursively(baseDir, relPath));
    } else if (entry.isFile()) {
      results.push({ posixPath: relPath.replace(/\\/g, "/"), fullPath });
    }
  }
  return results;
}

function createPosixZipFromDirectory(sourceDir, destinationZipFile) {
  const files = collectFilesRecursively(sourceDir);
  const localChunks = [];
  const cdChunks = [];
  let currentOffset = 0;
  const ZIP_UTF8_FLAG = 0x0800;

  for (const item of files) {
    const content = fs.readFileSync(item.fullPath);
    const crc = computeCrc32(content);
    let compressedData = content;
    let compressionMethod = 0;

    if (content.length > 0) {
      const deflated = zlib.deflateRawSync(content, { level: 6 });
      if (deflated.length < content.length) {
        compressedData = deflated;
        compressionMethod = 8;
      }
    }

    const nameBytes = Buffer.from(item.posixPath, "utf8");
    const localHeader = Buffer.alloc(30 + nameBytes.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(ZIP_UTF8_FLAG, 6);
    localHeader.writeUInt16LE(compressionMethod, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedData.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBytes.copy(localHeader, 30);

    const cdHeader = Buffer.alloc(46 + nameBytes.length);
    cdHeader.writeUInt32LE(0x02014b50, 0);
    cdHeader.writeUInt16LE(20, 4);
    cdHeader.writeUInt16LE(20, 6);
    cdHeader.writeUInt16LE(ZIP_UTF8_FLAG, 8);
    cdHeader.writeUInt16LE(compressionMethod, 10);
    cdHeader.writeUInt16LE(0, 12);
    cdHeader.writeUInt16LE(0, 14);
    cdHeader.writeUInt32LE(crc, 16);
    cdHeader.writeUInt32LE(compressedData.length, 20);
    cdHeader.writeUInt32LE(content.length, 24);
    cdHeader.writeUInt16LE(nameBytes.length, 28);
    cdHeader.writeUInt16LE(0, 30);
    cdHeader.writeUInt16LE(0, 32);
    cdHeader.writeUInt16LE(0, 34);
    cdHeader.writeUInt16LE(0, 36);
    cdHeader.writeUInt32LE(0, 38);
    cdHeader.writeUInt32LE(currentOffset, 42);
    nameBytes.copy(cdHeader, 46);

    localChunks.push(localHeader, compressedData);
    cdChunks.push(cdHeader);
    currentOffset += localHeader.length + compressedData.length;
  }

  const cdOffset = currentOffset;
  let cdSize = 0;
  for (const chunk of cdChunks) {
    cdSize += chunk.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  const zipBuffer = Buffer.concat([...localChunks, ...cdChunks, eocd]);
  fs.writeFileSync(destinationZipFile, zipBuffer);
  return { fileCount: files.length, byteLength: zipBuffer.length };
}

function runIsolatedProductionBuild() {
  if (fs.existsSync(isolatedBuildPath)) {
    fs.rmSync(isolatedBuildPath, { recursive: true, force: true });
  }

  const originalTsconfig = fs.existsSync(tsconfigPath)
    ? fs.readFileSync(tsconfigPath, "utf8")
    : null;

  const nextBin = path.join(
    projectRoot,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next"
  );

  console.log(
    "[FileVela cPanel Builder] Menjalankan kompilasi produksi Next.js untuk domain filevela.biz.id..."
  );

  try {
    execFileSync(process.execPath, [nextBin, "build"], {
      cwd: projectRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        NEXT_DIST_DIR: isolatedBuildDirName,
        NEXT_PUBLIC_SITE_DOMAIN:
          process.env.NEXT_PUBLIC_SITE_DOMAIN || "filevela.biz.id",
        NEXT_PUBLIC_SITE_URL:
          process.env.NEXT_PUBLIC_SITE_URL || "https://filevela.biz.id",
      },
    });
  } finally {
    if (originalTsconfig !== null) {
      fs.writeFileSync(tsconfigPath, originalTsconfig, "utf8");
    }
  }
}

function copyDirectoryFiltered(src, dest, excludeNames = new Set()) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (excludeNames.has(entry.name)) {
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryFiltered(srcPath, destPath, excludeNames);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function normalizeRequiredServerFiles(targetNextDir) {
  const reqFilesPath = path.join(targetNextDir, "required-server-files.json");
  if (!fs.existsSync(reqFilesPath)) {
    return;
  }
  try {
    const raw = fs.readFileSync(reqFilesPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if (parsed.config && typeof parsed.config === "object") {
        parsed.config.distDir = ".next";
      }
      if (typeof parsed.relativeAppDir === "string") {
        parsed.relativeAppDir = "";
      }
    }
    const normalizedJson = JSON.stringify(parsed, null, 2).replaceAll(
      isolatedBuildDirName,
      ".next"
    );
    fs.writeFileSync(reqFilesPath, normalizedJson, "utf8");
  } catch {
    // Ignore if structure differs
  }
}

function writeSlimProductionPackageJson(targetDir) {
  const rawPkg = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")
  );
  const slimPkg = {
    name: rawPkg.name || "filevela",
    version: rawPkg.version || "1.0.0",
    private: true,
    description: rawPkg.description,
    engines: rawPkg.engines,
    scripts: {
      start: "node server.js",
    },
    dependencies: rawPkg.dependencies,
  };
  fs.writeFileSync(
    path.join(targetDir, "package.json"),
    JSON.stringify(slimPkg, null, 2) + "\n",
    "utf8"
  );
}

function buildCpanelPackage() {
  const zipOnly = process.argv.includes("--zip-only");
  if (!zipOnly) {
    runIsolatedProductionBuild();

    const buildIdPath = path.join(isolatedBuildPath, "BUILD_ID");
    if (!fs.existsSync(buildIdPath)) {
      console.error(
        "[FileVela cPanel Builder] Kompilasi produksi gagal menghasilkan BUILD_ID."
      );
      process.exit(1);
    }

    if (fs.existsSync(distDir)) {
      fs.rmSync(distDir, { recursive: true, force: true });
    }
    fs.mkdirSync(distDir, { recursive: true });

    const targetNextDir = path.join(distDir, ".next");

    // 1. Salin hasil kompilasi .next tanpa cache webpack lokal & berkas trace
    copyDirectoryFiltered(
      isolatedBuildPath,
      targetNextDir,
      new Set(["cache", "trace"])
    );
    normalizeRequiredServerFiles(targetNextDir);

    // Bersihkan direktori build sementara
    try {
      fs.rmSync(isolatedBuildPath, { recursive: true, force: true });
    } catch {
      // Abaikan jika masih dilepas oleh OS
    }

    // 2. Salin direktori aset statis public/
    const publicDir = path.join(projectRoot, "public");
    if (fs.existsSync(publicDir)) {
      copyDirectoryFiltered(publicDir, path.join(distDir, "public"));
    }

    // 3. Salin berkas entrypoint cPanel & konfigurasi runtime
    const rootFiles = [
      "server.js",
      "app.js",
      "next.config.mjs",
      ".htaccess.cpanel.example",
      "PANDUAN_DEPLOY_CPANEL.md",
    ];

    for (const fileName of rootFiles) {
      const srcFile = path.join(projectRoot, fileName);
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, path.join(distDir, fileName));
      }
    }

    // 4. Tulis package.json khusus produksi (tanpa devDependencies agar Run NPM Install di cPanel cepat)
    writeSlimProductionPackageJson(distDir);

    // 5. Buat berkas .env.production default untuk domain filevela.biz.id
    const envProdTemplate = path.join(projectRoot, ".env.production.example");
    if (fs.existsSync(envProdTemplate)) {
      fs.copyFileSync(envProdTemplate, path.join(distDir, ".env.production"));
    }

    // 6. Siapkan kerangka direktori .storage/jobs dan .storage/downloads
    const jobsDir = path.join(distDir, ".storage", "jobs");
    const downloadsDir = path.join(distDir, ".storage", "downloads");
    fs.mkdirSync(jobsDir, { recursive: true });
    fs.mkdirSync(downloadsDir, { recursive: true });
    fs.writeFileSync(path.join(jobsDir, ".gitkeep"), "", "utf8");
    fs.writeFileSync(path.join(downloadsDir, ".gitkeep"), "", "utf8");
  } else {
    writeSlimProductionPackageJson(distDir);
    const lockInDist = path.join(distDir, "package-lock.json");
    if (fs.existsSync(lockInDist)) {
      fs.unlinkSync(lockInDist);
    }
  }

  // 7. Hasilkan arsip ZIP berformat path POSIX (/) yang siap di-Extract di Linux cPanel
  const { fileCount, byteLength } = createPosixZipFromDirectory(
    distDir,
    outputZipPath
  );
  const sizeMb = (byteLength / (1024 * 1024)).toFixed(2);

  console.log(
    `[FileVela cPanel Builder] Paket produksi cPanel berhasil dibuat:\n` +
      `  - Folder : ${distDir}\n` +
      `  - Arsip  : ${outputZipPath} (${fileCount} berkas, ${sizeMb} MB)`
  );
}

buildCpanelPackage();
