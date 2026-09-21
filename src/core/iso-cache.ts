import type { PinnedArtifact } from './artifacts.ts';

const CACHE_NAME = 'linuxlab-iso-v1';
const CACHE_VERSION = '2';
const MAX_CACHED_ARTIFACT_BYTES = 128 * 1024 * 1024;

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

export async function readIsoChunkCache(artifact: PinnedArtifact, start: number, end: number): Promise<ArrayBuffer | null> {
  if (!available() || !cacheable(artifact)) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(cacheKey(artifact, start, end));
    if (!response || !response.ok) return null;
    const expectedLength = end - start + 1;
    const length = response.headers.get('content-length');
    const cachedStart = response.headers.get('x-linuxlab-chunk-start');
    const cachedEnd = response.headers.get('x-linuxlab-chunk-end');
    const cachedTotal = response.headers.get('x-linuxlab-chunk-total');
    const cachedSha = response.headers.get('x-linuxlab-sha256');
    if (length !== null && Number(length) !== expectedLength) return null;
    if (cachedStart !== String(start) || cachedEnd !== String(end) || cachedTotal !== String(artifact.size) || cachedSha !== artifact.sha256) return null;
    const bytes = await response.arrayBuffer();
    return bytes.byteLength === expectedLength ? bytes : null;
  } catch { return null; }
}

export async function writeIsoChunkCache(artifact: PinnedArtifact, start: number, end: number, bytes: ArrayBuffer): Promise<void> {
  if (!available() || !cacheable(artifact) || bytes.byteLength !== end - start + 1) return;
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
      },
    });
    const cache = await caches.open(CACHE_NAME);
    await cache.put(cacheKey(artifact, start, end), response);
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
