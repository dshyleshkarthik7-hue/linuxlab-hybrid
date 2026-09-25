import { ALPINE_ARTIFACT, DEVELOPER_ALPINE_ARTIFACT, LINUX4_ARTIFACT, type PinnedArtifact } from './ISOIntegrity.ts';
import { Sha256 } from './sha256.ts';
import { clearIsoArtifactCache, readIsoChunkCache, writeIsoChunkCache } from './iso-cache.ts';

const inFlight = new Map<string, Promise<ArrayBuffer>>();
const inFlightConsumers = new Map<string, number>();
const inFlightControllers = new Map<string, AbortController>();
export const TRUSTED_ISO_ORIGIN = 'https://linuxterminal-iso.dshyleshkarthik7.workers.dev';
export const ISO_DELIVERY_PATH = '/api/iso/linux4';
const RANGE_FETCH_TIMEOUT_MS = 90_000;
const RANGE_CHUNK_BYTES = 48 * 1024 * 1024;
const RANGE_CONCURRENCY = 4;
const TRUSTED_HF_PREFIX = 'https://huggingface.co/buckets/shyleshkarthikd/alpine-iso-bucket/resolve/';

export function artifactForIsoUrl(rawUrl: string): PinnedArtifact {
  const url = new URL(rawUrl, window.location.origin);
  const artifacts = [LINUX4_ARTIFACT, ALPINE_ARTIFACT, DEVELOPER_ALPINE_ARTIFACT];
  const direct = artifacts.find((a) => new URL(a.url, window.location.origin).toString() === url.toString());
  if (direct) return direct;
  if (url.origin === TRUSTED_ISO_ORIGIN && url.pathname === '/') {
    const image = url.searchParams.get('image');
    if (image === 'virt') return ALPINE_ARTIFACT;
    if (image === 'linux4') return LINUX4_ARTIFACT;
    if (image === 'developer') return DEVELOPER_ALPINE_ARTIFACT;
  }
  if (url.origin === TRUSTED_HF_PREFIX.slice(0, -1) && url.href.startsWith(TRUSTED_HF_PREFIX)) {
    if (url.pathname.endsWith('/linux4.iso')) return LINUX4_ARTIFACT;
    if (url.pathname.endsWith('/alpine-virt-3.24.1-x86.iso')) return ALPINE_ARTIFACT;
    if (url.pathname.endsWith('/alpine.iso')) return DEVELOPER_ALPINE_ARTIFACT;
  }
  for (const a of artifacts) if ((a.fallbackUrls ?? []).includes(url.toString())) return a;
  throw new Error('Untrusted ISO endpoint');
}

function requestSignal(parent: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

async function fetchRange(url: string, start: number, end: number, artifact: PinnedArtifact, signal: AbortSignal): Promise<ArrayBuffer> {
  const cached = await readIsoChunkCache(artifact, start, end);
  if (cached) return cached;
  const chunkUrl = new URL(url, window.location.origin);
  chunkUrl.searchParams.set('chunkStart', String(start));
  chunkUrl.searchParams.set('chunkEnd', String(end));
  const range = `bytes=${start}-${end}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(chunkUrl, { cache: 'default', headers: { Range: range }, signal: requestSignal(signal, RANGE_FETCH_TIMEOUT_MS) });
      const chunkStart = response.headers.get('x-linuxlab-chunk-start');
      const chunkEnd = response.headers.get('x-linuxlab-chunk-end');
      const chunkTotal = response.headers.get('x-linuxlab-chunk-total');
      const isChunkResponse = chunkStart === String(start) && chunkEnd === String(end) && chunkTotal === String(artifact.size);
      if (response.status === 206) {
        const contentRange = response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
        if (!contentRange) throw new Error('ISO range integrity metadata mismatch');
        const responseStart = Number(contentRange[1]), responseEnd = Number(contentRange[2]), responseTotal = Number(contentRange[3]);
        if (!Number.isSafeInteger(responseStart) || !Number.isSafeInteger(responseEnd) || !Number.isSafeInteger(responseTotal) || responseStart !== start || responseEnd < responseStart || responseEnd > end || responseTotal !== artifact.size) throw new Error('ISO range integrity metadata mismatch');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== responseEnd - responseStart + 1) throw new Error('ISO range size mismatch');
        await writeIsoChunkCache(artifact, responseStart, responseEnd, bytes);
        return bytes;
      }
      if (response.status === 200 && isChunkResponse) {
        const length = response.headers.get('content-length');
        if (length !== null && Number(length) !== end - start + 1) throw new Error('ISO chunk size metadata mismatch');
        if (response.headers.get('x-linuxlab-sha256') !== artifact.sha256) throw new Error('ISO chunk digest metadata mismatch');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== end - start + 1) throw new Error('ISO chunk size mismatch');
        await writeIsoChunkCache(artifact, start, end, bytes);
        return bytes;
      }
      throw new Error(`ISO range request failed (${response.status})`);
    } catch (error) {
      lastError = error;
      if (signal.aborted) throw error;
      if (attempt < 2) await new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, 250 * 2 ** attempt); const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); }; signal.addEventListener('abort', abort, { once: true }); });
    }
  }
  throw lastError instanceof Error ? lastError : new Error('ISO range request failed');
}

async function fetchIsoResumable(url: string, artifact: PinnedArtifact, signal: AbortSignal): Promise<ArrayBuffer> {
  for (let cacheAttempt = 0; cacheAttempt < 2; cacheAttempt += 1) {
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
        hash.update(new Uint8Array(chunks[index]));
        bytes.set(new Uint8Array(chunks[index]), batch[index].start);
      }
    }
    if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    const actual = hash.digestHex();
    if (actual.toLowerCase() === artifact.sha256.toLowerCase()) return bytes.buffer;
    await clearIsoArtifactCache(artifact);
    if (cacheAttempt === 0) continue;
    throw new Error(`Artifact ${artifact.filename} failed SHA-256 integrity verification`);
  }
  throw new Error(`Artifact ${artifact.filename} failed SHA-256 integrity verification`);
}

export async function fetchVerifiedIso(rawUrl: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const url = new URL(rawUrl, window.location.origin);
  const artifact = artifactForIsoUrl(url.toString());
  const key = artifact.filename;
  const pending = inFlight.get(key);
  if (pending) {
    return waitForInFlight(key, pending, signal).finally(() => releaseInFlight(key, pending));
  }
  const controller = new AbortController();
  const promise = (async () => {
    let lastError: unknown;
    const image = url.searchParams.get('image') || (artifact.filename === 'linux4.iso' ? 'linux4' : artifact.filename === 'alpine.iso' ? 'developer' : 'virt');
    const candidates = [
      artifact.url,
      `${TRUSTED_ISO_ORIGIN}/?image=${image}`,
    ];
    for (const candidate of candidates) {
      try { return await fetchIsoResumable(candidate, artifact, controller.signal); }
      catch (error) { lastError = error; if (controller.signal.aborted) throw error; }
    }
    throw lastError instanceof Error ? lastError : new Error(`Artifact ${artifact.filename} could not be downloaded`);
  })();
  inFlight.set(key, promise);
  inFlightConsumers.set(key, 0);
  inFlightControllers.set(key, controller);
  void promise.finally(() => {
    if (inFlight.get(key) === promise) {
      inFlight.delete(key);
      inFlightConsumers.delete(key);
      inFlightControllers.delete(key);
    }
  }).catch(() => undefined);
  return waitForInFlight(key, promise, signal).finally(() => releaseInFlight(key, promise));
}

async function waitForInFlight<T>(key: string, promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  inFlightConsumers.set(key, (inFlightConsumers.get(key) ?? 0) + 1);
  return raceWithCallerSignal(promise, signal);
}

function releaseInFlight(key: string, promise: Promise<ArrayBuffer>): void {
  const consumers = Math.max(0, (inFlightConsumers.get(key) ?? 1) - 1);
  if (consumers === 0 && inFlight.get(key) === promise) {
    inFlightControllers.get(key)?.abort(new DOMException('No ISO download consumers remain', 'AbortError'));
  }
  inFlightConsumers.set(key, consumers);
}

async function raceWithCallerSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) throw signal.reason ?? new DOMException('Aborted','AbortError');
  return new Promise<T>((resolve,reject)=>{ const abort=()=>reject(signal.reason ?? new DOMException('Aborted','AbortError')); signal.addEventListener('abort',abort,{once:true}); promise.then(v=>{signal.removeEventListener('abort',abort);resolve(v);},err=>{signal.removeEventListener('abort',abort);reject(err);}); });
}
