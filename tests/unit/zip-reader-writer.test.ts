// File: tests/unit/zip-reader-writer.test.ts

import { describe, it, expect } from "vitest";
import { ZipWriter, computeCrc32 } from "@/lib/document/zip-writer";
import { ZipReader } from "@/lib/document/zip-reader";

describe("ZipWriter and ZipReader Unit Tests", () => {
  it("should calculate correct CRC-32 for string buffer", () => {
    const buf = Buffer.from("123456789", "utf8");
    const crc = computeCrc32(buf);
    // Standard CRC32 of "123456789" is 0xcbf43926 (3421780262)
    expect(crc).toBe(3421780262);
  });

  it("should write files into a zip buffer and read them back exactly", () => {
    const writer = new ZipWriter();
    writer.addFile("test/hello.txt", "Halo dari FileFlow!");
    writer.addFile(
      "data/config.json",
      JSON.stringify({ name: "FileFlow", status: "active" })
    );

    const zipBuffer = writer.toBuffer();
    expect(zipBuffer).toBeInstanceOf(Buffer);
    expect(zipBuffer.length).toBeGreaterThan(0);

    const reader = new ZipReader(zipBuffer);
    const files = reader.listFiles();
    expect(files).toContain("test/hello.txt");
    expect(files).toContain("data/config.json");

    const helloContent = reader.readText("test/hello.txt");
    expect(helloContent).toBe("Halo dari FileFlow!");

    const jsonContent = reader.readText("data/config.json");
    expect(JSON.parse(jsonContent!)).toEqual({
      name: "FileFlow",
      status: "active",
    });
  });
});

