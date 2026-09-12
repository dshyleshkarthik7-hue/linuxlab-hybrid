import { verifyResponse, ALPINE_ARTIFACT, DEVELOPER_ALPINE_ARTIFACT, LINUX4_ARTIFACT, type PinnedArtifact } from './ISOIntegrity.ts';

const cache = new Map<string, ArrayBuffer>();
const inFlight = new Map<string, Promise<ArrayBuffer>>();

export function artifactForIsoUrl(rawUrl: string): PinnedArtifact {
  const url = new URL(rawUrl, window.location.origin);
  if (url.searchParams.get('image') === 'virt') return ALPINE_ARTIFACT;
  if (url.searchParams.get('image') === 'linux4') return LINUX4_ARTIFACT;
  return DEVELOPER_ALPINE_ARTIFACT;
}

/**
 * Fetches the complete ISO, verifies its pinned SHA-256, then returns bytes
 * that can be supplied directly to v86. This is intentionally fail-closed:
 * no VM is created until the exact artifact has been verified.
 */
export async function fetchVerifiedIso(rawUrl: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const key = new URL(rawUrl, window.location.origin).toString();
  const cached = cache.get(key);
  if (cached) return cached.slice(0);
  const pending = inFlight.get(key);
  if (pending) return pending.then(bytes => bytes.slice(0));

  const artifact = artifactForIsoUrl(key);
  const promise = (async () => {
    const response = await fetch(key, { method: 'GET', cache: 'no-store', signal });
    const bytes = await verifyResponse(response, artifact);
    cache.clear();
    cache.set(key, bytes);
    return bytes;
  })();

  inFlight.set(key, promise);
  try {
    return (await promise).slice(0);
  } finally {
    inFlight.delete(key);
  }
}

export function clearVerifiedIsoCache(): void {
  cache.clear();
  inFlight.clear();
}
