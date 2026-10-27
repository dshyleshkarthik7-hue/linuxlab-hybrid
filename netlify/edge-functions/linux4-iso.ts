/**
 * Netlify Edge: serve linux4.iso with Range support from pinned GitHub/HF origins.
 * Small (~7.7 MiB) image stays on Netlify; large Alpine images remain on Cloudflare.
 */

const UPSTREAM_TIMEOUT_MS = 60_000;
const MAX_CHUNK_BYTES = 8 * 1024 * 1024;

const linux4 = {
  filename: 'linux4.iso',
  size: 7731200,
  sha256: 'a8ea434ab3b177c55f01275dcc1d35f52cfbee9bd44a32e74765c975b58bcc73',
  fallbackUrls: [
    'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v3.00/linux4.iso',
    'https://huggingface.co/buckets/shyleshkarthikd/alpine-iso-bucket/resolve/linux4.iso?download=true',
  ],
} as const;

function isTrustedUpstream(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const h = url.hostname.toLowerCase();
    return (
      h === 'github.com' ||
      h === 'objects.githubusercontent.com' ||
      h === 'release-assets.githubusercontent.com' ||
      (h.endsWith('.amazonaws.com') && h.startsWith('github-production-release-asset-')) ||
      h === 'huggingface.co' ||
      h.endsWith('.huggingface.co') ||
      h === 'hf.co' ||
      h.endsWith('.hf.co') ||
      h.endsWith('.xethub.hf.co')
    );
  } catch {
    return false;
  }
}

function parseRange(request: Request, size: number): { start: number; end: number } | null {
  const url = new URL(request.url);
  const qs = url.searchParams.get('chunkStart');
  const qe = url.searchParams.get('chunkEnd');
  if (qs !== null || qe !== null) {
    if (qs === null || qe === null) throw new Error('Both chunkStart and chunkEnd are required');
    if (!/^\d+$/.test(qs) || !/^\d+$/.test(qe)) throw new Error('Invalid chunk boundary');
    const start = Number(qs);
    const end = Number(qe);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= size) {
      throw new Error('Invalid chunk boundary');
    }
    if (end - start + 1 > MAX_CHUNK_BYTES) throw new Error('Chunk exceeds maximum size');
    return { start, end };
  }
  const range = request.headers.get('Range');
  if (!range) return null;
  const m = /^bytes=(\d+)-(\d*)$/.exec(range);
  if (!m) throw new Error('Invalid Range');
  const start = Number(m[1]);
  const end = m[2] === '' ? size - 1 : Number(m[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= size) {
    throw new Error('Invalid Range');
  }
  if (end - start + 1 > MAX_CHUNK_BYTES) throw new Error('Chunk exceeds maximum size');
  return { start, end };
}

function error(message: string, status: number, extra?: HeadersInit): Response {
  return new Response(message, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-range, content-length, accept-ranges, x-linuxlab-sha256, x-linuxlab-chunk-start, x-linuxlab-chunk-end, x-linuxlab-chunk-total, x-linuxlab-artifact-size, x-linuxlab-delivery',
      ...(extra || {}),
    },
  });
}

async function verifyFullArtifact(bytes: Uint8Array): Promise<void> {
  if (bytes.byteLength !== linux4.size) throw new Error('Unexpected full body length');
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', digestInput.buffer))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  if (digest !== linux4.sha256) throw new Error('Unexpected full body digest');
}

export default async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, HEAD, OPTIONS',
        'access-control-allow-headers': 'range, content-type, accept, accept-encoding',
        'access-control-max-age': '86400',
      },
    });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return error('Method Not Allowed', 405, { allow: 'GET, HEAD, OPTIONS' });
  }

  let range: { start: number; end: number } | null;
  try {
    range = parseRange(request, linux4.size);
  } catch {
    return error('Invalid range', 416, { 'content-range': `bytes */${linux4.size}` });
  }

  const origins = [...linux4.fallbackUrls].filter((u) => isTrustedUpstream(u));

  if (!origins.length) return error('No trusted linux4 origin configured', 503);

  const start = range?.start ?? 0;
  const end = range?.end ?? linux4.size - 1;
  const length = end - start + 1;
  const rangeHeader = `bytes=${start}-${end}`;
  const expectedContentRange = `bytes ${start}-${end}/${linux4.size}`;

  try {
    const upstream = await Promise.any(
      origins.map(async (origin) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
        try {
          const response = await fetch(origin, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
              Accept: 'application/octet-stream',
              'Accept-Encoding': 'identity',
              'User-Agent': 'LinuxTerminal-Netlify-Linux4/1.0',
              Range: rangeHeader,
            },
          });
          if (!isTrustedUpstream(response.url)) {
            response.body?.cancel();
            throw new Error('Untrusted redirect');
          }
          if (response.status === 206) {
            const cr = response.headers.get('content-range');
            const cl = response.headers.get('content-length');
            if (cr !== expectedContentRange || (cl !== null && cl !== String(length))) {
              response.body?.cancel();
              throw new Error('Invalid range metadata');
            }
            return response;
          }
          if (response.status === 200) {
            const bytes = new Uint8Array(await response.arrayBuffer());
            await verifyFullArtifact(bytes);
            const slice = bytes.slice(start, end + 1);
            return new Response(slice, {
              status: 206,
              headers: {
                'content-type': 'application/octet-stream',
                'content-range': expectedContentRange,
                'content-length': String(length),
                'accept-ranges': 'bytes',
              },
            });
          }
          response.body?.cancel();
          throw new Error(`Upstream ${response.status}`);
        } finally {
          clearTimeout(timer);
        }
      }),
    );

    const headers = new Headers({
      'content-type': 'application/octet-stream',
      'accept-ranges': 'bytes',
      'content-length': String(length),
      'x-linuxlab-sha256': linux4.sha256,
      'x-linuxlab-chunk-start': String(start),
      'x-linuxlab-chunk-end': String(end),
      'x-linuxlab-chunk-total': String(linux4.size),
      'x-linuxlab-artifact-size': String(linux4.size),
      'x-linuxlab-delivery': 'netlify-edge',
      'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
      'x-content-type-options': 'nosniff',
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-range, content-length, accept-ranges, x-linuxlab-sha256, x-linuxlab-chunk-start, x-linuxlab-chunk-end, x-linuxlab-chunk-total, x-linuxlab-artifact-size, x-linuxlab-delivery',
    });

    let body: BodyInit | null = upstream.body;
    if (!range) {
      const bytes = new Uint8Array(await upstream.arrayBuffer());
      await verifyFullArtifact(bytes);
      body = bytes;
    }
    if (range) headers.set('content-range', expectedContentRange);
    const responseStatus = range ? 206 : 200;
    return new Response(request.method === 'HEAD' ? null : body, { status: responseStatus, headers });
  } catch (cause) {
    const invalidUpstream = cause instanceof Error && /digest|length|metadata|trusted redirect/i.test(cause.message);
    return error(invalidUpstream ? 'linux4 ISO upstream validation failed' : 'linux4 ISO temporarily unavailable', invalidUpstream ? 502 : 504);
  }
};
