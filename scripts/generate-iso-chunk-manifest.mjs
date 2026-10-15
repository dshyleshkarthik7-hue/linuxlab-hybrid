#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import manifest from '../artifacts/manifest.json' with { type: 'json' };

export const DEFAULT_CHUNK_SIZE = 32 * 1024 * 1024;
const developer = manifest.artifacts.find((item) => item.image === 'developer');
if (!developer) throw new Error('Developer Alpine artifact is missing from artifacts/manifest.json');

export async function buildChunkManifest(source, artifact, chunkSize = DEFAULT_CHUNK_SIZE) {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) throw new Error('Chunk size must be a positive safe integer.');
  if (!Number.isSafeInteger(artifact.size) || artifact.size < 1 || !/^[a-f0-9]{64}$/i.test(artifact.sha256 || '')) throw new Error('Artifact size and SHA-256 must be pinned.');
  const fullHash = createHash('sha256'), chunks = [];
  let total = 0, chunkBytes = 0, chunkHash = createHash('sha256');
  const finishChunk = () => {
    chunks.push({ index: chunks.length, start: total - chunkBytes, end: total - 1, sha256: chunkHash.digest('hex') });
    chunkBytes = 0; chunkHash = createHash('sha256');
  };
  for await (const item of source) {
    const bytes = Buffer.isBuffer(item) ? item : Buffer.from(item);
    let offset = 0;
    while (offset < bytes.length) {
      const take = Math.min(chunkSize - chunkBytes, bytes.length - offset);
      const part = bytes.subarray(offset, offset + take);
      fullHash.update(part); chunkHash.update(part); total += take; chunkBytes += take; offset += take;
      if (chunkBytes === chunkSize) finishChunk();
    }
  }
  if (chunkBytes > 0) finishChunk();
  const actualSha256 = fullHash.digest('hex');
  if (total !== artifact.size) throw new Error('Artifact size mismatch: got ' + total + ', expected ' + artifact.size + '.');
  if (actualSha256.toLowerCase() !== artifact.sha256.toLowerCase()) throw new Error('Artifact SHA-256 mismatch: got ' + actualSha256 + '.');
  return { schemaVersion: 1, artifactSha256: actualSha256, artifactSize: total, chunkSize, chunks };
}

async function main(args) {
  const options = { output: path.resolve('artifacts/developer-alpine-chunks.json'), input: null, url: null, chunkSize: DEFAULT_CHUNK_SIZE };
  for (let i = 0; i < args.length; i++) {
    const value = args[i];
    if (value === '--input') options.input = args[++i];
    else if (value === '--url') options.url = args[++i];
    else if (value === '--output') options.output = path.resolve(args[++i]);
    else if (value === '--chunk-size') options.chunkSize = Number(args[++i]);
    else if (value === '--help') { process.stdout.write('Usage: node scripts/generate-iso-chunk-manifest.mjs [--input ISO | --url URL] [--output JSON] [--chunk-size BYTES]\n'); return; }
    else throw new Error('Unknown argument: ' + value);
  }
  if (options.input && options.url) throw new Error('Choose either --input or --url.');
  let source;
  if (options.input) source = createReadStream(path.resolve(options.input));
  else {
    const url = options.url || developer.fallbackUrls?.find((value) => value.startsWith('https://github.com/') && value.includes('/releases/download/'));
    if (!url) throw new Error('No trusted Developer Alpine release URL is configured.');
    const parsed = new URL(url);
    const allowed = (u) => u.protocol === 'https:' && (u.hostname === 'github.com' || u.hostname === 'release-assets.githubusercontent.com' || u.hostname === 'objects.githubusercontent.com' || (u.hostname.endsWith('.amazonaws.com') && u.hostname.startsWith('github-production-release-asset-')));
    if (!allowed(parsed)) throw new Error('Chunk manifest source must be a trusted HTTPS GitHub release asset.');
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20 * 60 * 1000), headers: { Accept: 'application/octet-stream', 'Accept-Encoding': 'identity', 'User-Agent': 'LinuxTerminal-Chunk-Manifest/1.0' } });
    if (!response.ok || !allowed(new URL(response.url))) { response.body?.cancel(); throw new Error('Developer Alpine release asset download failed (' + response.status + ').'); }
    const length = response.headers.get('content-length');
    if (length && Number(length) !== developer.size) { response.body?.cancel(); throw new Error('Release asset Content-Length does not match the pinned artifact size.'); }
    if (!response.body) throw new Error('Release asset response has no body.');
    source = Readable.fromWeb(response.body);
  }
  const result = await buildChunkManifest(source, developer, options.chunkSize);
  await writeFile(options.output, JSON.stringify(result, null, 2) + '\n', 'utf8');
  process.stdout.write('Verified ' + result.artifactSize + ' bytes as ' + result.chunks.length + ' SHA-256 chunks; wrote ' + options.output + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => { process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n'); process.exitCode = 1; });
}
