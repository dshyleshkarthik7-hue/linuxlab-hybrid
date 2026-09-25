import type { PinnedArtifact } from './artifacts.ts';
import { Sha256 } from './sha256.ts';

const CACHE_NAME = 'linuxlab-iso-v1';
const CACHE_VERSION = '3';
const MAX_CACHED_ARTIFACT_BYTES = 128 * 1024 * 1024;
const MAX_CACHE_BYTES = 96 * 1024 * 1024;
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cacheKey(artifact: PinnedArtifact, start: number, end: number): Request {
  const url = new URL('https://linuxlab.local/__iso-cache__');
  url.searchParams.set('v', CACHE_VERSION);
  url.searchParams.set('sha256', artifact.sha256);
  url.searchParams.set('start', String(start));
  url.searchParams.set('end', String(end));
  return new Request(url.toString(), { method: 'GET' });
}

function available(): boolean { return typeof caches !== 'undefined'; }
function cacheable(artifact: PinnedArtifact): boolean { return artifact.size <= MAX_CACHED_ARTIFACT_BYTES; }

async function prune(cache: Cache): Promise<void> {
  const requests = await cache.keys();
  const now = Date.now();
  const entries: Array<{ request: Request; size: number; touched: number }> = [];
  for (const request of requests) {
    const response = await cache.match(request);
    if (!response) continue;
    const size = Number(response.headers.get('content-length') || 0);
    const touched = Number(response.headers.get('x-linuxlab-cache-touched') || 0);
    if (!Number.isSafeInteger(size) || size <= 0 || !Number.isFinite(touched) || touched <= 0 || now - touched > MAX_CACHE_AGE_MS) {
      await cache.delete(request);
      continue;
    }
    entries.push({ request, size, touched });
  }
  let total = entries.reduce((sum, entry) => sum + entry.size, 0);
  entries.sort((a, b) => a.touched - b.touched);
  for (const entry of entries) {
    if (total <= MAX_CACHE_BYTES) break;
    await cache.delete(entry.request);
    total -= entry.size;
  }
}

export async function readIsoChunkCache(artifact: PinnedArtifact, start: number, end: number): Promise<ArrayBuffer | null> {
  if (!available() || !cacheable(artifact)) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const key = cacheKey(artifact, start, end);
    const response = await cache.match(key);
    if (!response || !response.ok) return null;
    const expectedLength = end - start + 1;
    const length = response.headers.get('content-length');
    const cachedStart = response.headers.get('x-linuxlab-chunk-start');
    const cachedEnd = response.headers.get('x-linuxlab-chunk-end');
    const cachedTotal = response.headers.get('x-linuxlab-chunk-total');
    const cachedSha = response.headers.get('x-linuxlab-sha256');
    const cachedChunkDigest = response.headers.get('x-linuxlab-chunk-digest');
    if (length !== null && Number(length) !== expectedLength) return null;
    if (cachedStart !== String(start) || cachedEnd !== String(end) || cachedTotal !== String(artifact.size) || cachedSha !== artifact.sha256 || !/^[a-f0-9]{64}$/i.test(cachedChunkDigest || '')) return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== expectedLength) return null;
    const digest = new Sha256().update(new Uint8Array(bytes)).digestHex();
    if (digest !== cachedChunkDigest!.toLowerCase()) { await cache.delete(key); return null; }
    const touched = new Response(bytes.slice(0), { status: 200, headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.byteLength),
      'x-linuxlab-chunk-start': String(start),
      'x-linuxlab-chunk-end': String(end),
      'x-linuxlab-chunk-total': String(artifact.size),
      'x-linuxlab-sha256': artifact.sha256,
      'x-linuxlab-chunk-digest': cachedChunkDigest!,
      'x-linuxlab-cache-touched': String(Date.now()),
    }});
    await cache.put(key, touched);
    return bytes;
  } catch { return null; }
}

export async function writeIsoChunkCache(artifact: PinnedArtifact, start: number, end: number, bytes: ArrayBuffer): Promise<void> {
  if (!available() || !cacheable(artifact) || bytes.byteLength !== end - start + 1 || bytes.byteLength > MAX_CACHE_BYTES) return;
  try {
    const response = new Response(bytes.slice(0), {
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(bytes.byteLength),
        'x-linuxlab-chunk-start': String(start),
        'x-linuxlab-chunk-end': String(end),
        'x-linuxlab-chunk-total': String(artifact.size),
        'x-linuxlab-sha256': artifact.sha256,
        'x-linuxlab-cache-touched': String(Date.now()),
      },
    });
    const cache = await caches.open(CACHE_NAME);
    await cache.put(cacheKey(artifact, start, end), response);
    await prune(cache);
  } catch {}
}

export async function clearIsoArtifactCache(artifact: PinnedArtifact): Promise<void> {
  if (!available()) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();
    await Promise.all(requests
      .filter(request => new URL(request.url).searchParams.get('sha256') === artifact.sha256)
      .map(request => cache.delete(request)));
  } catch {}
}
