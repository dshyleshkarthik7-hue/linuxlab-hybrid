import { verifyResponse, ALPINE_ARTIFACT, DEVELOPER_ALPINE_ARTIFACT, LINUX4_ARTIFACT, type PinnedArtifact } from './ISOIntegrity.ts';

const cache = new Map<string, ArrayBuffer>();
const inFlight = new Map<string, Promise<ArrayBuffer>>();
const ISO_FETCH_TIMEOUT_MS = 90_000;

export function artifactForIsoUrl(rawUrl: string): PinnedArtifact {
  const url = new URL(rawUrl, window.location.origin);
  const path = url.pathname;
  const image = url.searchParams.get('image');
  if (path !== '/api/iso') throw new Error(`Untrusted ISO endpoint: ${url.origin}${path}`);
  if (image === 'virt') return ALPINE_ARTIFACT;
  if (image === 'linux4') return LINUX4_ARTIFACT;
  if (image === null) return DEVELOPER_ALPINE_ARTIFACT;
  throw new Error(`Unknown ISO profile: ${image}`);
}

export async function fetchVerifiedIso(rawUrl: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const url = new URL(rawUrl, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error('ISO endpoint must be same-origin');
  const key = url.toString();
  const artifact = artifactForIsoUrl(key);
  const cached = cache.get(key);
  if (cached) return cached.slice(0);
  const pending = inFlight.get(key);
  if (pending) return pending.then(bytes => bytes.slice(0));

  const promise = (async () => {
    const timeout = AbortSignal.timeout(ISO_FETCH_TIMEOUT_MS);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const response = await fetch(key, { method: 'GET', cache: 'no-store', signal: requestSignal });
    const bytes = await verifyResponse(response, artifact);
    cache.clear();
    cache.set(key, bytes.slice(0));
    return bytes;
  })();
  inFlight.set(key, promise);
  try { return (await promise).slice(0); } finally { if (inFlight.get(key) === promise) inFlight.delete(key); }
}

export function clearVerifiedIsoCache(): void { cache.clear(); inFlight.clear(); }
