// File: tests/integration/jobs-api.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { POST as createJobHandler } from "@/app/api/jobs/route";
import { GET as getJobHandler, DELETE as deleteJobHandler } from "@/app/api/jobs/[id]/route";
import { GET as downloadJobHandler } from "@/app/api/jobs/[id]/download/route";
import { POST as bgRemovalHandler } from "@/app/api/background-removal/route";

async function createSyntheticPngBuffer(width = 100, height = 100): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

describe("Jobs and Background Removal API Integration", () => {
  beforeEach(() => {
    sharp.cache(false);
  });

  it("should reject job creation if file is missing", async () => {
    const formData = new FormData();
    formData.append("targetFormat", "jpg");

    const req = new NextRequest("http://localhost:3000/api/jobs", {
      method: "POST",
      body: formData,
    });

    const res = await createJobHandler(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("MISSING_FILE");
  });

  it("should successfully convert PNG to JPG via POST /api/jobs", async () => {
    const pngBuffer = await createSyntheticPngBuffer(80, 80);
    const uint8 = new Uint8Array(pngBuffer);
    const blob = new Blob([uint8], { type: "image/png" });

    const formData = new FormData();
    formData.append("file", blob, "sample.png");
    formData.append("targetFormat", "jpg");

    const req = new NextRequest("http://localhost:3000/api/jobs", {
      method: "POST",
      body: formData,
    });

    const res = await createJobHandler(req);
    expect(res.status).toBe(201);
    const json = await res.json();

    expect(json.job).toBeDefined();
    expect(json.job.id).toBeDefined();
    expect(json.job.status).toBe("succeeded");
    expect(json.job.targetFormat).toBe("jpg");
    expect(json.ownerToken).toBeDefined();

    const jobId = json.job.id;
    const ownerToken = json.ownerToken;

    // Test GET /api/jobs/[id] with valid token
    const pollReq = new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, {
      headers: {
        "X-Session-Token": ownerToken,
      },
    });
    const pollRes = await getJobHandler(pollReq, { params: { id: jobId } });
    expect(pollRes.status).toBe(200);
    const pollJson = await pollRes.json();
    expect(pollJson.status).toBe("succeeded");

    // Test GET /api/jobs/[id] with forged token -> 403
    const badPollReq = new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, {
      headers: {
        "X-Session-Token": "0000000000000000000000000000000000000000000000000000000000000000",
      },
    });
    const badPollRes = await getJobHandler(badPollReq, { params: { id: jobId } });
    expect(badPollRes.status).toBe(403);

    // Test GET /api/jobs/[id]/download with valid token
    const dlReq = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/download?token=${ownerToken}`);
    const dlRes = await downloadJobHandler(dlReq, { params: { id: jobId } });
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers.get("Content-Type")).toBe("image/jpeg");
    const dlBuffer = Buffer.from(await dlRes.arrayBuffer());
    expect(dlBuffer.length).toBeGreaterThan(0);
    // Verify magic bytes of JPEG: 0xFF, 0xD8, 0xFF
    expect(dlBuffer[0]).toBe(0xff);
    expect(dlBuffer[1]).toBe(0xd8);
    expect(dlBuffer[2]).toBe(0xff);

    // Test DELETE /api/jobs/[id] with valid token
    const delReq = new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });
    const delRes = await deleteJobHandler(delReq, { params: { id: jobId } });
    expect(delRes.status).toBe(200);

    // After deletion, poll returns 404
    const postDelReq = new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, {
      headers: { "X-Session-Token": ownerToken },
    });
    const postDelRes = await getJobHandler(postDelReq, { params: { id: jobId } });
    expect(postDelRes.status).toBe(404);
  });

  it("should process background removal and output transparent PNG via POST /api/background-removal", async () => {
    const pngBuffer = await createSyntheticPngBuffer(60, 60);
    const uint8 = new Uint8Array(pngBuffer);
    const blob = new Blob([uint8], { type: "image/png" });

    const formData = new FormData();
    formData.append("file", blob, "photo.png");

    const req = new NextRequest("http://localhost:3000/api/background-removal", {
      method: "POST",
      body: formData,
    });

    const res = await bgRemovalHandler(req);
    expect(res.status).toBe(201);
    const json = await res.json();

    expect(json.job).toBeDefined();
    expect(json.job.status).toBe("succeeded");
    expect(json.job.isTransparent).toBe(true);
    expect(json.job.transparentPixelCount).toBeGreaterThan(0);
    expect(json.ownerToken).toBeDefined();

    const jobId = json.job.id;
    const ownerToken = json.ownerToken;

    // Download transparent result
    const dlReq = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/download?token=${ownerToken}`);
    const dlRes = await downloadJobHandler(dlReq, { params: { id: jobId } });
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers.get("Content-Type")).toBe("image/png");

    const dlBuffer = Buffer.from(await dlRes.arrayBuffer());
    // Verify PNG magic bytes: 0x89, 0x50, 0x4E, 0x47
    expect(dlBuffer[0]).toBe(0x89);
    expect(dlBuffer[1]).toBe(0x50);
    expect(dlBuffer[2]).toBe(0x4e);
    expect(dlBuffer[3]).toBe(0x47);

    // Verify alpha channel has transparent pixels
    const metadata = await sharp(dlBuffer).metadata();
    expect(metadata.channels).toBe(4);
    expect(metadata.hasAlpha).toBe(true);

    const raw = await sharp(dlBuffer).raw().toBuffer();
    let hasTransparentAlpha = false;
    for (let i = 3; i < raw.length; i += 4) {
      if ((raw[i] ?? 255) < 255) {
        hasTransparentAlpha = true;
        break;
      }
    }
    expect(hasTransparentAlpha).toBe(true);

    // Cleanup
    const delReq = new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, {
      method: "DELETE",
      headers: { "X-Session-Token": ownerToken },
    });
    await deleteJobHandler(delReq, { params: { id: jobId } });
  });
});
