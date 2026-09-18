import { verifyResponse, verifyArtifact, ALPINE_ARTIFACT, DEVELOPER_ALPINE_ARTIFACT, LINUX4_ARTIFACT, type PinnedArtifact } from './ISOIntegrity.ts';
import { Sha256 } from './sha256.ts';

const memoryCache = new Map<string, ArrayBuffer>();
const inFlight = new Map<string, Promise<ArrayBuffer>>();
const ISO_FETCH_TIMEOUT_MS = 90_000, RANGE_FETCH_TIMEOUT_MS = 90_000;
const DIRECT_FETCH_MAX_BYTES = 64 * 1024 * 1024, RANGE_CHUNK_BYTES = 48 * 1024 * 1024, RANGE_CONCURRENCY = 2;

export function artifactForIsoUrl(rawUrl: string): PinnedArtifact {
  const url = new URL(rawUrl, window.location.origin), image = url.searchParams.get('image');
  if (url.origin !== window.location.origin || url.pathname !== '/api/iso') throw new Error('Untrusted ISO endpoint');
  if (image === 'virt') return ALPINE_ARTIFACT;
  if (image === 'linux4') return LINUX4_ARTIFACT;
  if (image === 'developer') return DEVELOPER_ALPINE_ARTIFACT;
  throw new Error('ISO profile is required: use image=linux4, image=virt, or image=developer');
}
function requestSignal(parent: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}
async function fetchRange(url: string, start: number, end: number, artifact: PinnedArtifact, signal: AbortSignal): Promise<ArrayBuffer> {
  const chunkUrl = new URL(url);
  chunkUrl.searchParams.set('chunkStart', String(start)); chunkUrl.searchParams.set('chunkEnd', String(end));
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(chunkUrl, { headers: { Range: `bytes=${start}-${end}` }, cache: 'no-store', signal: requestSignal(signal, RANGE_FETCH_TIMEOUT_MS) });
      const chunkStart = response.headers.get('x-linuxlab-chunk-start'), chunkEnd = response.headers.get('x-linuxlab-chunk-end'), chunkTotal = response.headers.get('x-linuxlab-chunk-total');
      const isChunkResponse = chunkStart === String(start) && chunkEnd === String(end) && chunkTotal === String(artifact.size);
      if (response.status === 206) {
        if (response.headers.get('content-range') !== `bytes ${start}-${end}/${artifact.size}`) throw new Error('ISO range integrity metadata mismatch');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== end - start + 1) throw new Error('ISO range size mismatch');
        return bytes;
      }
      if (response.status === 200 && isChunkResponse) {
        const length = response.headers.get('content-length');
        if (length !== null && Number(length) !== end - start + 1) throw new Error('ISO chunk size metadata mismatch');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== end - start + 1) throw new Error('ISO chunk size mismatch');
        return bytes;
      }
      throw new Error(`ISO range request failed (${response.status})`);
    } catch (error) {
      lastError = error;
      if (signal.aborted) throw error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('ISO range request failed');
}
async function fetchIsoResumable(url: string, artifact: PinnedArtifact, signal: AbortSignal): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(artifact.size), hash = new Sha256();
  let nextStart = 0;
  while (nextStart < artifact.size) {
    if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    const batch: Array<{ start: number; end: number }> = [];
    for (let i = 0; i < RANGE_CONCURRENCY && nextStart < artifact.size; i += 1) {
      const start = nextStart, end = Math.min(artifact.size - 1, start + RANGE_CHUNK_BYTES - 1);
      batch.push({ start, end }); nextStart = end + 1;
    }
    const chunks = await Promise.all(batch.map(({ start, end }) => fetchRange(url, start, end, artifact, signal)));
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      hash.update(new Uint8Array(chunk)); bytes.set(new Uint8Array(chunk), batch[index].start);
    }
  }
  if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  const actual = hash.digestHex();
  if (actual.toLowerCase() !== artifact.sha256.toLowerCase()) throw new Error(`Artifact ${artifact.filename} failed SHA-256 integrity verification`);
  return bytes.buffer;
}
export async function fetchVerifiedIso(rawUrl: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const url = new URL(rawUrl, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error('ISO endpoint must be same-origin');
  const key = url.toString(), artifact = artifactForIsoUrl(key);
  const cached = memoryCache.get(key);
  if (cached) { await verifyArtifact(cached, artifact); return cached.slice(0); }
  const pending = inFlight.get(key);
  if (pending) return pending.then(bytes => bytes.slice(0));
  const promise = (async () => {
    let bytes: ArrayBuffer;
    if (artifact.size <= DIRECT_FETCH_MAX_BYTES) {
      try {
        const fullImageUrl = new URL(key);
        fullImageUrl.searchParams.set('chunkStart', '0');
        fullImageUrl.searchParams.set('chunkEnd', String(artifact.size - 1));
        bytes = await verifyResponse(await fetch(fullImageUrl, { method: 'GET', cache: 'no-store', signal: requestSignal(signal, ISO_FETCH_TIMEOUT_MS) }), artifact);
      } catch (error) {
        if (signal?.aborted) throw error;
        bytes = await fetchIsoResumable(key, artifact, signal ?? new AbortController().signal);
      }
    } else bytes = await fetchIsoResumable(key, artifact, signal ?? new AbortController().signal);
    memoryCache.clear(); memoryCache.set(key, bytes); return bytes;
  })();
  inFlight.set(key, promise);
  try { return (await promise).slice(0); } finally { if (inFlight.get(key) === promise) inFlight.delete(key); }
}
