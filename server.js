// File: server.js

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parse } = require("url");
const next = require("next");

process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.NEXT_TELEMETRY_DISABLED = "1";
process.env.NEXT_PUBLIC_SITE_DOMAIN =
  process.env.NEXT_PUBLIC_SITE_DOMAIN || "filevela.biz.id";
process.env.NEXT_PUBLIC_SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://filevela.biz.id";

// Augment PATH on Linux/cPanel (CloudLinux Phusion Passenger) so binaries in ~/bin or ~/.local/bin are discoverable
if (process.platform !== "win32") {
  const homeDir = os.homedir();
  const extraPaths = [
    path.join(homeDir, "bin"),
    path.join(homeDir, ".local", "bin"),
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];
  const currentPaths = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const extra of extraPaths) {
    if (!currentPaths.includes(extra)) {
      currentPaths.unshift(extra);
    }
  }
  process.env.PATH = currentPaths.join(path.delimiter);
}

// Initialize isolated storage directories (.storage/jobs & .storage/downloads)
function ensureStorageDirectories() {
  const storageRoot = process.env.STORAGE_DIR
    ? path.resolve(process.env.STORAGE_DIR.trim())
    : path.resolve(__dirname, ".storage");

  const subDirs = [
    storageRoot,
    path.join(storageRoot, "jobs"),
    path.join(storageRoot, "downloads"),
  ];

  for (const dir of subDirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
      }
    } catch (err) {
      console.error("[FileVela] Failed to initialize storage directory:", err);
    }
  }
}

ensureStorageDirectories();

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const rawPort = process.env.PORT || "3000";
const isNamedSocket =
  typeof rawPort === "string" && Number.isNaN(Number(rawPort));
const numericPort = isNamedSocket ? 3000 : parseInt(String(rawPort), 10);

const app = next({
  dev,
  dir: __dirname,
  hostname,
  port: numericPort,
});

const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = http.createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url || "/", true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error("[FileVela] Unhandled request error:", err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              error: "Internal Server Error",
              message: "Terjadi kesalahan internal pada server FileVela.",
            })
          );
        }
      }
    });

    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    const onListening = () => {
      const bindTarget = isNamedSocket
        ? `socket ${rawPort}`
        : `http://${hostname}:${numericPort}`;
      console.log(
        `[FileVela] Production server ready on ${bindTarget} (domain: ${process.env.NEXT_PUBLIC_SITE_URL}, env: ${process.env.NODE_ENV})`
      );
    };

    if (isNamedSocket) {
      server.listen(rawPort, onListening);
    } else {
      server.listen(numericPort, hostname, onListening);
    }

    const shutdown = (signal) => {
      console.log(`[FileVela] Received ${signal}, shutting down gracefully...`);
      server.close(() => {
        process.exit(0);
      });
      setTimeout(() => {
        process.exit(0);
      }, 8000).unref();
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  })
  .catch((err) => {
    console.error("[FileVela] Failed to start Next.js server:", err);
    process.exit(1);
  });

