#!/usr/bin/env node
/**
 * Generate Developer Alpine range integrity metadata from the actual ISO bytes.
 * Never run against an untrusted or partially downloaded image.
 *
 * Usage: node scripts/generate-developer-chunk-manifest.mjs /path/to/alpine.iso
 */
import { createHash } from "node:crypto";
import { open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const source = process.argv[2];
if (!source) throw new Error("Pass the path to the actual alpine.iso artifact.");
const manifestPath = path.join(root, "artifacts/developer-alpine-chunks.json");
const artifactManifest = JSON.parse(await readFile(path.join(root, "artifacts/manifest.json"), "utf8"));
const expected = artifactManifest.artifacts.find((item) => item.image === "developer");
if (!expected || !/^[a-f0-9]{64}$/i.test(expected.sha256) || !Number.isSafeInteger(expected.size)) {
  throw new Error("Pinned Developer Alpine size/SHA-256 is missing or malformed.");
}
const handle = await open(source, "r");
try {
  const stat = await handle.stat();
  if (stat.size !== expected.size) throw new Error("ISO size mismatch: expected " + expected.size + ", received " + stat.size);
  const chunkSize = 32 * 1024 * 1024;
  const chunks = [];
  const whole = createHash("sha256");
  const buffer = Buffer.allocUnsafe(chunkSize);
  let offset = 0;
  while (offset < stat.size) {
    const length = Math.min(chunkSize, stat.size - offset);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    if (bytesRead !== length) throw new Error("Short read while hashing ISO at offset " + offset);
    const bytes = buffer.subarray(0, length);
    whole.update(bytes);
    chunks.push({ index: chunks.length, start: offset, end: offset + length - 1, sha256: createHash("sha256").update(bytes).digest("hex") });
    offset += length;
    process.stdout.write("Hashed " + offset + "/" + stat.size + " bytes\n");
  }
  const digest = whole.digest("hex");
  if (digest.toLowerCase() !== expected.sha256.toLowerCase()) {
    throw new Error("Whole ISO SHA-256 mismatch: expected " + expected.sha256 + ", received " + digest + ". Manifest was not changed.");
  }
  const output = { schemaVersion: 1, artifactSha256: digest, artifactSize: stat.size, chunkSize, chunks };
  await writeFile(manifestPath, JSON.stringify(output, null, 2) + "\n");
  process.stdout.write("Wrote " + chunks.length + " verified chunk digests to artifacts/developer-alpine-chunks.json\n");
} finally {
  await handle.close();
}
