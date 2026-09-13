import { verifyResponse, verifyArtifact, ALPINE_ARTIFACT, DEVELOPER_ALPINE_ARTIFACT, LINUX4_ARTIFACT, type PinnedArtifact } from './ISOIntegrity.ts';

const memoryCache = new Map<string, ArrayBuffer>();
const inFlight = new Map<string, Promise<ArrayBuffer>>();
const ISO_FETCH_TIMEOUT_MS = 90_000;
const IDB_NAME = 'LinuxLab_ISO_Cache';
const IDB_VERSION = 1;
const IDB_STORE = 'artifacts';

type CachedIso = { url: string; sha256: string; size: number; bytes: ArrayBuffer; storedAt: number };

export function artifactForIsoUrl(rawUrl: string): PinnedArtifact {
  const url = new URL(rawUrl, window.location.origin);
  const image = url.searchParams.get('image');
  if (url.pathname !== '/api/iso') throw new Error(`Untrusted ISO endpoint: ${url.origin}${url.pathname}`);
  if (image === 'virt') return ALPINE_ARTIFACT;
  if (image === 'linux4') return LINUX4_ARTIFACT;
  if (image === null) return DEVELOPER_ALPINE_ARTIFACT;
  throw new Error(`Unknown ISO profile: ${image}`);
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
  try {
    const db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({ url, sha256: artifact.sha256, size: artifact.size, bytes: bytes.slice(0), storedAt: Date.now() } satisfies CachedIso);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('ISO cache write failed'));
      tx.onabort = () => reject(tx.error ?? new Error('ISO cache write aborted'));
    });
    db.close();
  } catch { /* Cache is an optimization; verified network delivery remains authoritative. */ }
}

export async function fetchVerifiedIso(rawUrl: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const url = new URL(rawUrl, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error('ISO endpoint must be same-origin');
  const key = url.toString();
  const artifact = artifactForIsoUrl(key);
  const cached = memoryCache.get(key);
  if (cached) { await verifyArtifact(cached, artifact); return cached.slice(0); }
  const persistent = await readPersistent(key, artifact);
  if (persistent) { memoryCache.set(key, persistent.slice(0)); return persistent.slice(0); }
  const pending = inFlight.get(key);
  if (pending) return pending.then(bytes => bytes.slice(0));
  const promise = (async () => {
    const timeout = AbortSignal.timeout(ISO_FETCH_TIMEOUT_MS);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const response = await fetch(key, { method: 'GET', cache: 'no-store', signal: requestSignal });
    const bytes = await verifyResponse(response, artifact);
    memoryCache.clear();
    memoryCache.set(key, bytes.slice(0));
    await writePersistent(key, artifact, bytes);
    return bytes;
  })();
  inFlight.set(key, promise);
  try { return (await promise).slice(0); } finally { if (inFlight.get(key) === promise) inFlight.delete(key); }
}

export function clearVerifiedIsoCache(): void {
  memoryCache.clear();
  inFlight.clear();
  void openCache().then(db => new Promise<void>(resolve => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); resolve(); };
    tx.onabort = () => { db.close(); resolve(); };
  })).catch(() => undefined);
}
