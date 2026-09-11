import { verifyResponse, ALPINE_ARTIFACT, DEVELOPER_ALPINE_ARTIFACT, LINUX4_ARTIFACT } from './ISOIntegrity.ts';

const cache = new Map<string, ArrayBuffer>();
const inFlight = new Map<string, Promise<ArrayBuffer>>();
const nativeFetch = window.fetch.bind(window);

function artifactFor(url: URL) {
  if (url.searchParams.get('image') === 'virt') return ALPINE_ARTIFACT;
  if (url.searchParams.get('image') === 'linux4') return LINUX4_ARTIFACT;
  return DEVELOPER_ALPINE_ARTIFACT;
}

async function loadVerified(key: string, request: Request, artifact: ReturnType<typeof artifactFor>): Promise<ArrayBuffer> {
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const promise = (async () => {
    const headers = new Headers(request.headers);
    headers.delete('range');
    const response = await nativeFetch(new Request(request, { headers, signal: request.signal }));
    const bytes = await verifyResponse(response, artifact);
    // Keep at most one complete ISO in memory. A new image replaces the old one.
    for (const oldKey of cache.keys()) cache.delete(oldKey);
    cache.set(key, bytes);
    return bytes;
  })();
  inFlight.set(key, promise);
  try { return await promise; }
  finally { inFlight.delete(key); }
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const request = new Request(input, init);
  const url = new URL(request.url, window.location.href);
  if (url.origin !== window.location.origin || url.pathname !== '/api/iso') return nativeFetch(request);

  const key = url.pathname + url.search;
  const bytes = await loadVerified(key, request, artifactFor(url));
  return new Response(bytes.slice(0), {
    status: 200,
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(bytes.byteLength),
      'cache-control': 'no-store',
      'accept-ranges': 'bytes',
    },
  });
};
