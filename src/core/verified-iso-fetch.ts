import { verifyResponse, ALPINE_ARTIFACT, DEVELOPER_ALPINE_ARTIFACT, LINUX4_ARTIFACT } from './ISOIntegrity.ts';

const cache = new Map<string, ArrayBuffer>();
const nativeFetch = window.fetch.bind(window);
function artifactFor(url: URL) {
  if (url.searchParams.get('image') === 'virt') return ALPINE_ARTIFACT;
  if (url.searchParams.get('image') === 'linux4') return LINUX4_ARTIFACT;
  return DEVELOPER_ALPINE_ARTIFACT;
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const request = new Request(input, init);
  const url = new URL(request.url, window.location.href);
  if (url.origin !== window.location.origin || url.pathname !== '/api/iso') return nativeFetch(request);

  const key = url.pathname + url.search;
  let bytes = cache.get(key);
  if (!bytes) {
    const response = await nativeFetch(new Request(request, { headers: new Headers([...request.headers].filter(([k]) => k.toLowerCase() !== 'range')) }));
    bytes = await verifyResponse(response, artifactFor(url));
    cache.set(key, bytes);
  }

  // Return a fresh Response so callers (including v86) can consume the verified
  // bytes independently. Range requests are intentionally answered with the
  // verified complete artifact: the digest must cover the exact bytes booted.
  return new Response(bytes.slice(0), { status: 200, headers: { 'content-type': 'application/octet-stream', 'content-length': String(bytes.byteLength), 'cache-control': 'no-store' } });
};
