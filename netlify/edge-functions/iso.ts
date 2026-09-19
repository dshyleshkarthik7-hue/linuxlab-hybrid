import { ALPINE_ARTIFACT, DEVELOPER_ALPINE_ARTIFACT, LINUX4_ARTIFACT } from '../../src/core/artifacts.ts';

const ARTIFACTS = {
  virt: ALPINE_ARTIFACT,
  developer: DEVELOPER_ALPINE_ARTIFACT,
  linux4: LINUX4_ARTIFACT,
} as const;

const MAX_RANGE_BYTES = 48 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

function getRange(request: Request, size: number): { start: number; end: number } | null {
  const header = request.headers.get('range');
  if (!header) return null;
  const match = /^bytes=(\d+)-(\d+)$/.exec(header);
  if (!match) throw new Error('Only a single explicit byte range is supported');
  const start = Number(match[1]), end = Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= size) {
    throw new Error('Requested byte range is outside the pinned artifact');
  }
  if (end - start + 1 > MAX_RANGE_BYTES) throw new Error('Requested byte range is too large');
  return { start, end };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const image = new URL(request.url).searchParams.get('image') as keyof typeof ARTIFACTS | null;
  const artifact = image ? ARTIFACTS[image] : undefined;
  if (!artifact) return new Response('Unknown ISO profile', { status: 400 });

  try {
    const range = getRange(request, artifact.size);
    if (!range) {
      return new Response('A single byte Range header is required for ISO delivery', {
        status: 416,
        headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes */${artifact.size}` },
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const upstream = await fetch(artifact.url, {
        method: request.method,
        headers: { Range: `bytes=${range.start}-${range.end}` },
        redirect: 'follow',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (upstream.status !== 206) {
        return new Response('ISO upstream did not honor the requested byte range', { status: 502 });
      }
      const contentRange = upstream.headers.get('content-range');
      const expectedRange = `bytes ${range.start}-${range.end}/${artifact.size}`;
      if (contentRange !== expectedRange) return new Response('ISO range metadata mismatch', { status: 502 });

      const headers = new Headers({
        'Accept-Ranges': 'bytes',
        'Content-Range': expectedRange,
        'Content-Length': String(range.end - range.start + 1),
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Verified': 'sha256-client-pinned',
        'X-Content-SHA256': artifact.sha256,
        'X-Content-Size': String(artifact.size),
        'X-LinuxLab-Chunk-Start': String(range.start),
        'X-LinuxLab-Chunk-End': String(range.end),
        'X-LinuxLab-Chunk-Total': String(artifact.size),
      });
      return new Response(request.method === 'HEAD' ? null : upstream.body, { status: 206, headers });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.error(`ISO delivery failed: ${error instanceof Error ? error.message : String(error)}`);
    return new Response('Verified ISO range unavailable', { status: 502 });
  }
}
