import { verifyResponse, verifyArtifact, ALPINE_ARTIFACT, DEVELOPER_ALPINE_ARTIFACT, LINUX4_ARTIFACT, type PinnedArtifact } from './ISOIntegrity.ts';
import { Sha256 } from './sha256.ts';

const memoryCache = new Map<string, ArrayBuffer>();
const inFlight = new Map<string, Promise<ArrayBuffer>>();
const ISO_FETCH_TIMEOUT_MS = 90_000;
const RANGE_FETCH_TIMEOUT_MS = 90_000;
const DIRECT_FETCH_MAX_BYTES = 64 * 1024 * 1024;
const RANGE_CHUNK_BYTES = 48 * 1024 * 1024;
const RANGE_CONCURRENCY = 2;
const LARGE_ISO_CACHE_THRESHOLD = 256 * 1024 * 1024;
const IDB_NAME = 'LinuxLab_ISO_Cache';
const IDB_VERSION = 2;
const IDB_STORE = 'artifacts';
const MAX_PERSISTENT_CACHE_BYTES = 768 * 1024 * 1024;

type CachedIso = { url: string; sha256: string; size: number; bytes: ArrayBuffer; storedAt: number };

export function artifactForIsoUrl(rawUrl: string): PinnedArtifact {
  const url = new URL(rawUrl, window.location.origin);
  const image = url.searchParams.get('image');
  if (url.pathname !== '/api/iso') throw new Error(`Untrusted ISO endpoint: ${url.origin}${url.pathname}`);
  if (image === 'virt') return ALPINE_ARTIFACT;
  if (image === 'linux4') return LINUX4_ARTIFACT;
  if (image === 'developer') return DEVELOPER_ALPINE_ARTIFACT;
  throw new Error('ISO profile is required: use image=linux4, image=virt, or image=developer');
}

function requestSignal(parent: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB is unavailable')); return; }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: 'url' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open ISO cache'));
  });
}

async function readPersistent(url: string, artifact: PinnedArtifact): Promise<ArrayBuffer | null> {
  if (artifact.size > LARGE_ISO_CACHE_THRESHOLD) return null;
  try {
    const db = await openCache();
    const record = await new Promise<CachedIso | undefined>((resolve, reject) => {
      const request = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(url);
      request.onsuccess = () => resolve(request.result as CachedIso | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!record || record.sha256.toLowerCase() !== artifact.sha256.toLowerCase() || record.size !== artifact.size) return null;
    await verifyArtifact(record.bytes, artifact);
    return record.bytes.slice(0);
  } catch { return null; }
}

async function writePersistent(url: string, artifact: PinnedArtifact, bytes: ArrayBuffer): Promise<void> {
  if (artifact.size > LARGE_ISO_CACHE_THRESHOLD) return;
  try {
    const db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        const records = (request.result as CachedIso[]).filter((item) => item.url !== url).sort((a, b) => a.storedAt - b.storedAt);
        let total = records.reduce((sum, item) => sum + (Number.isFinite(item.size) ? item.size : item.bytes.byteLength), 0);
        for (const item of records) {
          if (total + bytes.byteLength <= MAX_PERSISTENT_CACHE_BYTES) break;
          store.delete(item.url);
          total -= item.size;
        }
        if (bytes.byteLength <= MAX_PERSISTENT_CACHE_BYTES) store.put({ url, sha256: artifact.sha256, size: artifact.size, bytes: bytes.slice(0), storedAt: Date.now() } satisfies CachedIso);
      };
      request.onerror = () => reject(request.error ?? new Error('ISO cache read failed'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('ISO cache write failed'));
      tx.onabort = () => reject(tx.error ?? new Error('ISO cache write aborted'));
    });
    db.close();
  } catch { /* cache is an optimization; verified network transport remains authoritative */ }
}

async function fetchRange(url: string, start: number, end: number, artifact: PinnedArtifact, signal: AbortSignal): Promise<ArrayBuffer> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, cache: 'no-store', signal: requestSignal(signal, RANGE_FETCH_TIMEOUT_MS) });
      if (response.status === 206) {
        if (response.headers.get('content-range') !== `bytes ${start}-${end}/${artifact.size}`) throw new Error('ISO range integrity metadata mismatch');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== end - start + 1) throw new Error('ISO range size mismatch');
        return bytes;
      }
      if (response.status === 416) throw new Error('ISO range rejected');
      if (attempt === 2) throw new Error(`ISO range request failed (${response.status})`);
    } catch (error) {
      if (signal.aborted || attempt === 2) throw error;
    }
  }
  throw new Error('ISO range request failed');
}

async function fetchIsoResumable(url: string, artifact: PinnedArtifact, signal: AbortSignal): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(artifact.size);
  const hash = new Sha256();
  let nextStart = 0;
  while (nextStart < artifact.size) {
    const batch: Array<{ start: number; end: number }> = [];
    for (let i = 0; i < RANGE_CONCURRENCY && nextStart < artifact.size; i += 1) {
      const start = nextStart;
      const end = Math.min(artifact.size - 1, start + RANGE_CHUNK_BYTES - 1);
      batch.push({ start, end });
      nextStart = end + 1;
    }
    const chunks = await Promise.all(batch.map(({ start, end }) => fetchRange(url, start, end, artifact, signal)));
    chunks.forEach((chunk, index) => {
      bytes.set(new Uint8Array(chunk), batch[index].start);
      hash.update(new Uint8Array(chunk));
    });
  }
  const actual = hash.digestHex();
  if (actual.toLowerCase() !== artifact.sha256.toLowerCase()) throw new Error(`Artifact ${artifact.filename} failed SHA-256 integrity verification`);
  return bytes.buffer;
}

function consumerBuffer(bytes: ArrayBuffer, artifact: PinnedArtifact): ArrayBuffer {
  return artifact.size > LARGE_ISO_CACHE_THRESHOLD ? bytes : bytes.slice(0);
}

export async function fetchVerifiedIso(rawUrl: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const url = new URL(rawUrl, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error('ISO endpoint must be same-origin');
  const key = url.toString();
  const artifact = artifactForIsoUrl(key);
  const cached = memoryCache.get(key);
  if (cached) { await verifyArtifact(cached, artifact); return consumerBuffer(cached, artifact); }
  const persistent = await readPersistent(key, artifact);
  if (persistent) { memoryCache.set(key, persistent); return consumerBuffer(persistent, artifact); }
  const pending = inFlight.get(key);
  if (pending) return pending.then((bytes) => consumerBuffer(bytes, artifact));

  const promise = (async () => {
    let bytes: ArrayBuffer;
    if (artifact.size <= DIRECT_FETCH_MAX_BYTES) {
      try {
        const response = await fetch(key, { method: 'GET', cache: 'no-store', signal: requestSignal(signal, ISO_FETCH_TIMEOUT_MS) });
        bytes = await verifyResponse(response, artifact);
      } catch (error) {
        if (signal?.aborted) throw error;
        bytes = await fetchIsoResumable(key, artifact, signal ?? new AbortController().signal);
      }
    } else {
      bytes = await fetchIsoResumable(key, artifact, signal ?? new AbortController().signal);
    }
    memoryCache.clear();
    memoryCache.set(key, bytes);
    await writePersistent(key, artifact, bytes);
    return bytes;
  })();
  inFlight.set(key, promise);
  try { return consumerBuffer(await promise, artifact); }
  finally { if (inFlight.get(key) === promise) inFlight.delete(key); }
}

export async function clearVerifiedIsoCache(): Promise<void> {
  memoryCache.clear();
  inFlight.clear();
  await openCache().then((db) => new Promise<void>((resolve) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); resolve(); };
  })).catch(() => undefined);
}
