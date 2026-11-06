// File: tests/integration/compress-api.test.ts

import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { POST as compressHandler } from "@/lib/../app/api/compress/route";
import { GET as downloadHandler } from "@/lib/../app/api/jobs/[id]/download/route";

describe("Compress API Integration Tests", () => {
  it("should reject request when no file is provided", async () => {
    const formData = new FormData();
    const req = new NextRequest("http://localhost:3000/api/compress", {
      method: "POST",
      body: formData,
    });

    const res = await compressHandler(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.code).toBe("MISSING_FILE");
  });

  it("should reject request with an empty file (0 bytes)", async () => {
    const formData = new FormData();
    const emptyBlob = new Blob([], { type: "image/png" });
    formData.append("file", emptyBlob, "empty.png");

    const req = new NextRequest("http://localhost:3000/api/compress", {
      method: "POST",
      body: formData,
    });

    const res = await compressHandler(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.code).toBe("EMPTY_FILE");
  });

  it("should compress a valid PNG image and allow authorized download", async () => {
    const rawPng = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 50, g: 150, b: 250, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(rawPng)], { type: "image/png" });
    formData.append("file", blob, "sample.png");
    formData.append("level", "recommended");

    const req = new NextRequest("http://localhost:3000/api/compress", {
      method: "POST",
      body: formData,
    });

    const res = await compressHandler(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("succeeded");
    expect(data.job).toBeDefined();
    expect(data.job.status).toBe("succeeded");
    expect(data.ownerToken).toBeDefined();
    expect(data.ownerToken.length).toBe(64);
    expect(data.job.inputSizeBytes).toBe(rawPng.length);
    expect(data.job.outputSizeBytes).toBeGreaterThan(0);

    // Verify authorized download works
    const downloadReq = new NextRequest(
      `http://localhost:3000/api/jobs/${data.job.id}/download?token=${data.ownerToken}`,
      { method: "GET" }
    );

    const downloadRes = await downloadHandler(downloadReq, {
      params: { id: data.job.id },
    });

    expect(downloadRes.status).toBe(200);
    const downloadedBuf = Buffer.from(await downloadRes.arrayBuffer());
    expect(downloadedBuf.length).toBe(data.job.outputSizeBytes);
  });
});
