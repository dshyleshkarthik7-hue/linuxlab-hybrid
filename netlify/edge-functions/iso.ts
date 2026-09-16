import { ALPINE_ARTIFACT, DEVELOPER_ALPINE_ARTIFACT, LINUX4_ARTIFACT } from '../../src/core/artifacts.ts';

type ImageName = 'developer' | 'virt' | 'linux4';
type ImageSource = typeof ALPINE_ARTIFACT;

const IMAGES: Record<ImageName, ImageSource> = {
  developer: DEVELOPER_ALPINE_ARTIFACT,
  virt: ALPINE_ARTIFACT,
  linux4: LINUX4_ARTIFACT,
};

const PRODUCTION_ORIGIN = 'https://linuxterminal.me';
const verifiedCache = new Map<string, number>();
const VERIFY_TTL_MS = 10 * 60_000;
const UPSTREAM_TIMEOUT_MS = 120_000;

const imageFor = (request: Request): ImageName | null => {
  const value = new URL(request.url).searchParams.get('image');
  return value === 'developer' || value === 'virt' || value === 'linux4' ? value : null;
};

function cors(source: ImageSource): Headers {
  return new Headers({
    'Access-Control-Allow-Origin': PRODUCTION_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, If-Range, If-None-Match, If-Modified-Since',
    'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Last-Modified, X-LinuxLab-SHA256',
    'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    'Accept-Ranges': 'bytes',
    'X-LinuxLab-SHA256': source.sha256,
  });
}

async function verifyReleaseAsset(source: ImageSource): Promise<void> {
  const cached = verifiedCache.get(source.filename);
  if (cached !== undefined && Date.now() - cached < VERIFY_TTL_MS) return;

  const response = await fetch(source.releaseManifestUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'LinuxTerminal-ISO-Proxy/16.0',
    },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Release manifest unavailable (${response.status})`);

  const release = await response.json() as {
    assets?: Array<{ name?: string; size?: number; digest?: string | null }>;
  };
  const asset = release.assets?.find((candidate) => candidate.name === source.filename);
  const digest = asset?.digest?.toLowerCase().replace(/^sha256:/, '');
  if (!asset || asset.size !== source.size || digest !== source.sha256.toLowerCase()) {
    throw new Error(`Release manifest digest mismatch for ${source.filename}`);
  }
  verifiedCache.set(source.filename, Date.now());
}

function rangeFor(request: Request, size: number): { start: number; end: number } | null {
  const value = request.headers.get('range');
  if (!value) return null;
  const match = /^bytes=(\d+)-(\d*)$/.exec(value.trim());
  if (!match) throw new Error('Invalid Range header');

  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
    throw new Error('Range outside ISO bounds');
  }
  return { start, end: Math.min(end, size - 1) };
}

export default async (request: Request): Promise<Response> => {
  const image = imageFor(request);
  if (!image) {
    return new Response('Unknown image; specify image=linux4, image=virt, or image=developer', { status: 404 });
  }

  const source = IMAGES[image];
  const headers = cors(source);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    headers.set('Allow', 'GET, HEAD, OPTIONS');
    return new Response('Method Not Allowed', { status: 405, headers });
  }

  let range: { start: number; end: number } | null = null;
  try {
    range = rangeFor(request, source.size);
  } catch {
    headers.set('Content-Range', `bytes */${source.size}`);
    return new Response('Invalid Range', { status: 416, headers });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    await verifyReleaseAsset(source);

    const upstreamHeaders = new Headers({
      Accept: 'application/octet-stream',
      'User-Agent': 'LinuxTerminal-ISO-Proxy/16.0',
      'Accept-Encoding': 'identity',
    });
    if (range) upstreamHeaders.set('Range', `bytes=${range.start}-${range.end}`);

    const upstream = await fetch(source.url, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: 'follow',
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!upstream.ok || (range && upstream.status !== 206)) {
      return new Response(`ISO upstream unavailable (${upstream.status})`, { status: 502, headers });
    }

    const expectedLength = range ? range.end - range.start + 1 : source.size;
    const contentLength = upstream.headers.get('content-length');
    if (contentLength !== null && Number(contentLength) !== expectedLength) {
      return new Response('ISO upstream has an unexpected size', { status: 502, headers });
    }

    if (range) {
      const contentRange = upstream.headers.get('content-range');
      if (contentRange !== `bytes ${range.start}-${range.end}/${source.size}`) {
        return new Response('ISO upstream returned an unexpected range', { status: 502, headers });
      }
      headers.set('Content-Range', contentRange);
    }

    headers.set('Content-Length', String(expectedLength));
    headers.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    headers.set('ETag', `"${source.sha256}"`);

    if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });
    return new Response(upstream.body, { status: range ? 206 : 200, headers });
  } catch (error) {
    console.error('[LinuxLab] ISO proxy error:', error instanceof Error ? error.message : String(error));
    return new Response('ISO proxy temporarily unavailable', {
      status: 504,
      headers: new Headers({
        ...Object.fromEntries(headers),
        'Cache-Control': 'no-store',
      }),
    });
  } finally {
    clearTimeout(timer);
  }
};

export const config = { path: '/api/iso' };
