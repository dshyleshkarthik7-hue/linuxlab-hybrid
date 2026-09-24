import manifest from '../../artifacts/manifest.json' with { type: 'json' };

export const config = { path: '/api/iso/linux4', cache: 'manual' as const };

const MAX_CHUNK_BYTES = 48 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;
const WORKER_PROTOCOL_VERSION = '4';

type Artifact = {
  image?: string;
  size: number;
  sha256: string;
  filename: string;
  fallbackUrls?: string[];
};

const ARTIFACT = (manifest.artifacts as Artifact[]).find((artifact) => artifact.image === 'linux4');

function corsOrigin(origin: string | null): string | null {
  if (!origin) return null;
  try {
    const u = new URL(origin);
    const allowedPreview =
      /^([a-z0-9-]+)--linuxterminalm\.netlify\.app$/i.test(u.hostname) ||
      /^([a-z0-9-]+)--linuxterminal\.netlify\.app$/i.test(u.hostname);
    if (u.protocol === 'https:' && (
      u.origin === 'https://linuxterminal.me' ||
      u.origin === 'https://www.linuxterminal.me' ||
      allowedPreview
    )) return u.origin;
  } catch {}
  return null;
}

function parseRange(value: string | null, size: number): { start: number; end: number } | null {
  if (!value) return null;
  const match = /^bytes=(\d+)-(\d*)$/i.exec(value.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] === '' ? size - 1 : Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size || end >= size) return null;
  if (end - start + 1 > MAX_CHUNK_BYTES) return null;
  return { start, end };
}

function isTrustedUpstream(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return url.hostname === 'huggingface.co' || url.hostname.endsWith('.hf.co') ||
      url.hostname === 'github.com' || url.hostname === 'objects.githubusercontent.com' ||
      url.hostname === 'release-assets.githubusercontent.com';
  } catch { return false; }
}

function baseHeaders(origin: string | null): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Range,Content-Type,If-Range,If-None-Match,If-Modified-Since',
    'Access-Control-Expose-Headers': 'Accept-Ranges,Content-Length,Content-Range,ETag,X-LinuxLab-SHA256,X-LinuxLab-Worker-Protocol,X-LinuxLab-Chunk-Start,X-LinuxLab-Chunk-End,X-LinuxLab-Chunk-Total,X-LinuxLab-Artifact-Size',
    'Vary': 'Origin',
    'Accept-Ranges': 'bytes',
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'no-store',
    'CDN-Cache-Control': 'no-store',
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = corsOrigin(request.headers.get('Origin'));
  const headers = baseHeaders(origin);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    headers.set('Allow', 'GET, HEAD, OPTIONS');
    return new Response('Method Not Allowed', { status: 405, headers });
  }
  if (!ARTIFACT) return new Response('Linux4 artifact is not configured', { status: 500, headers });

  const queryStart = url.searchParams.get('chunkStart');
  const queryEnd = url.searchParams.get('chunkEnd');
  const queryRange = queryStart !== null || queryEnd !== null ? `bytes=${queryStart ?? ''}-${queryEnd ?? ''}` : null;
  const headerRange = request.headers.get('Range');
  if (queryRange && headerRange && queryRange !== headerRange) {
    headers.set('Content-Range', `bytes */${ARTIFACT.size}`);
    return new Response('Conflicting range parameters', { status: 416, headers });
  }

  const chunk = parseRange(headerRange || queryRange, ARTIFACT.size);
  if (!chunk) {
    headers.set('Content-Range', `bytes */${ARTIFACT.size}`);
    return new Response('A single valid byte range is required', { status: 416, headers });
  }

  const expectedLength = chunk.end - chunk.start + 1;
  const expectedContentRange = `bytes ${chunk.start}-${chunk.end}/${ARTIFACT.size}`;
  const range = `bytes=${chunk.start}-${chunk.end}`;
  const candidates = (ARTIFACT.fallbackUrls ?? []).filter(isTrustedUpstream);

  for (const candidate of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const upstream = await fetch(candidate, {
        method: 'GET',
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
        headers: { Range: range, Accept: 'application/octet-stream', 'Accept-Encoding': 'identity' },
      });

      let response = upstream;
      if (upstream.status >= 300 && upstream.status < 400) {
        const location = upstream.headers.get('Location');
        if (!location) continue;
        let redirected: URL;
        try { redirected = new URL(location, candidate); } catch { continue; }
        if (!isTrustedUpstream(redirected.href)) continue;
        const redirectController = new AbortController();
        const redirectTimer = setTimeout(() => redirectController.abort(), UPSTREAM_TIMEOUT_MS);
        try {
          response = await fetch(redirected.href, {
            method: 'GET',
            redirect: 'manual',
            cache: 'no-store',
            signal: redirectController.signal,
            headers: { Range: range, Accept: 'application/octet-stream', 'Accept-Encoding': 'identity' },
          });
        } finally {
          clearTimeout(redirectTimer);
        }
        if (response.status >= 300 && response.status < 400) continue;
      }

      if (response.status !== 206) continue;
      const contentRange = response.headers.get('Content-Range');
      const contentLength = response.headers.get('Content-Length');
      if (contentRange !== expectedContentRange || contentLength !== String(expectedLength)) continue;

      headers.set('Content-Range', expectedContentRange);
      headers.set('Content-Length', String(expectedLength));
      headers.set('X-LinuxLab-SHA256', ARTIFACT.sha256);
      headers.set('X-LinuxLab-Worker-Protocol', WORKER_PROTOCOL_VERSION);
      headers.set('X-LinuxLab-Chunk-Start', String(chunk.start));
      headers.set('X-LinuxLab-Chunk-End', String(chunk.end));
      headers.set('X-LinuxLab-Chunk-Total', String(ARTIFACT.size));
      headers.set('X-LinuxLab-Artifact-Size', String(ARTIFACT.size));
      headers.set('ETag', `"${ARTIFACT.sha256}-${chunk.start}-${chunk.end}"`);
      return new Response(request.method === 'HEAD' ? null : response.body, { status: 206, headers });
    } catch {
      // Try the next pinned origin.
    } finally {
      clearTimeout(timer);
    }
  }

  return new Response('ISO upstream temporarily unavailable', { status: 502, headers });
}
