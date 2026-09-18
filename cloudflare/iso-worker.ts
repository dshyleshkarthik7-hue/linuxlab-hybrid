import { ALPINE_ARTIFACT, DEVELOPER_ALPINE_ARTIFACT, LINUX4_ARTIFACT } from '../src/core/artifacts.ts';

type ImageName = 'developer' | 'virt' | 'linux4';
type ImageSource = typeof ALPINE_ARTIFACT;
const IMAGES: Record<ImageName, ImageSource> = { developer: DEVELOPER_ALPINE_ARTIFACT, virt: ALPINE_ARTIFACT, linux4: LINUX4_ARTIFACT };
const MAX_CHUNK_BYTES = 48 * 1024 * 1024;
const PRODUCTION_ORIGIN = 'https://linuxterminal.me';

function corsHeaders(): Headers {
  return new Headers({
    'Access-Control-Allow-Origin': PRODUCTION_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, If-Range, If-None-Match, If-Modified-Since',
    'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, X-LinuxLab-SHA256, X-LinuxLab-Chunk-Start, X-LinuxLab-Chunk-End, X-LinuxLab-Chunk-Total',
  });
}
function imageFor(url: URL): ImageSource | null {
  const image = url.searchParams.get('image');
  return image === 'developer' || image === 'virt' || image === 'linux4' ? IMAGES[image] : null;
}
function chunkFor(url: URL, size: number): { start: number; end: number } {
  const rawStart = url.searchParams.get('chunkStart'), rawEnd = url.searchParams.get('chunkEnd');
  if (rawStart === null || rawEnd === null || !/^\d+$/.test(rawStart) || !/^\d+$/.test(rawEnd)) throw new Error('chunkStart and chunkEnd are required');
  const start = Number(rawStart), requestedEnd = Number(rawEnd);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || requestedEnd < start || start >= size) throw new Error('Chunk outside ISO bounds');
  const end = Math.min(requestedEnd, size - 1);
  if (end - start + 1 > MAX_CHUNK_BYTES) throw new Error('Chunk exceeds maximum size');
  return { start, end };
}
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url), headers = corsHeaders();
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      headers.set('Allow', 'GET, HEAD, OPTIONS');
      return new Response('Method Not Allowed', { status: 405, headers });
    }
    const source = imageFor(url);
    if (!source) return new Response('Unknown image', { status: 404, headers });
    let chunk: { start: number; end: number };
    try { chunk = chunkFor(url, source.size); } catch { return new Response('Invalid chunk', { status: 416, headers }); }

    let upstream: Response;
    try {
      upstream = await fetch(new Request(source.url, {
        method: request.method,
        headers: {
          Accept: 'application/octet-stream',
          'User-Agent': 'LinuxTerminal-ISO-Chunk-Worker/18.0',
          'Accept-Encoding': 'identity',
          Range: `bytes=${chunk.start}-${chunk.end}`,
        },
      }));
    } catch {
      return new Response('ISO origin unavailable', { status: 502, headers });
    }
    if (upstream.status !== 206) return new Response('ISO origin unavailable (' + upstream.status + ')', { status: 502, headers });

    const expectedLength = chunk.end - chunk.start + 1;
    const contentRange = upstream.headers.get('content-range');
    const contentLength = upstream.headers.get('content-length');
    if (contentRange !== 'bytes ' + chunk.start + '-' + chunk.end + '/' + source.size || contentLength !== String(expectedLength)) {
      return new Response('ISO origin returned invalid chunk metadata', { status: 502, headers });
    }
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    headers.set('Content-Length', String(expectedLength));
    headers.set('Accept-Ranges', 'bytes');
    headers.set('ETag', '"' + source.sha256 + '-' + chunk.start + '-' + chunk.end + '"');
    headers.set('X-LinuxLab-SHA256', source.sha256);
    headers.set('X-LinuxLab-Chunk-Start', String(chunk.start));
    headers.set('X-LinuxLab-Chunk-End', String(chunk.end));
    headers.set('X-LinuxLab-Chunk-Total', String(source.size));
    headers.set('Content-Range', contentRange);
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
    return new Response(upstream.body, { status: 200, headers });
  },
};