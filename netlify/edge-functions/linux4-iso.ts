import manifest from '../../artifacts/manifest.json' with { type: 'json' };

const ARTIFACTS = Object.fromEntries(
  (manifest.artifacts as Array<{ image?: string; size: number; fallbackUrls?: string[] }>)
    .filter((artifact) => artifact.image)
    .map((artifact) => [artifact.image, artifact]),
);

function corsOrigin(origin) {
  if (!origin) return null;
  try {
    const u = new URL(origin);
    if (u.protocol === 'https:' && (
      u.origin === 'https://linuxterminal.me' ||
      u.origin === 'https://www.linuxterminal.me' ||
      u.hostname.endsWith('.netlify.app')
    )) return u.origin;
  } catch {}
  return null;
}

function getArtifact(url) {
  const image = url.searchParams.get('image') || 'linux4';
  if (image !== 'linux4' && image !== 'virt' && image !== 'developer') return null;
  return ARTIFACTS[image] ?? null;
}

export default async function handler(request) {
  const url = new URL(request.url);
  const artifact = getArtifact(url);
  const origin = corsOrigin(request.headers.get('Origin'));
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Range,Content-Type,If-Range,If-None-Match,If-Modified-Since',
    'Access-Control-Expose-Headers': 'Accept-Ranges,Content-Length,Content-Range,ETag,X-LinuxLab-Chunk-Start,X-LinuxLab-Chunk-End,X-LinuxLab-Chunk-Total,X-LinuxLab-Artifact-Size',
    'Vary': 'Origin',
    'Accept-Ranges': 'bytes',
    'Content-Type': 'application/octet-stream',
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method Not Allowed', { status: 405, headers });
  if (!artifact) return new Response('Unknown ISO image', { status: 404, headers });

  const start = url.searchParams.get('chunkStart');
  const end = url.searchParams.get('chunkEnd');
  const range = request.headers.get('Range') || (start !== null && end !== null ? `bytes=${start}-${end}` : null);
  if (!range || !/^bytes=\d+-\d*$/.test(range)) {
    headers.set('Content-Range', `bytes */${artifact.size}`);
    return new Response('A single byte range is required', { status: 416, headers });
  }

  let upstream = null;
  for (const candidate of [artifact.fallbackUrls?.find((value) => value.includes('huggingface.co/')), ...[]].filter(Boolean)) {
    try {
      upstream = await fetch(candidate, { headers: { Range: range, Accept: 'application/octet-stream', 'Accept-Encoding': 'identity' } });
      if (upstream.status === 206) break;
    } catch {}
  }
  if (!upstream || upstream.status !== 206) return new Response('ISO upstream unavailable', { status: 502, headers });

  const contentRange = upstream.headers.get('Content-Range');
  const contentLength = upstream.headers.get('Content-Length');
  if (!contentRange || !contentLength) return new Response('ISO upstream returned invalid range metadata', { status: 502, headers });

  headers.set('Content-Range', contentRange);
  headers.set('Content-Length', contentLength);
  headers.set('X-LinuxLab-Chunk-Start', start ?? contentRange.match(/^bytes (\d+)-/)?.[1] ?? '');
  headers.set('X-LinuxLab-Chunk-End', end ?? contentRange.match(/^bytes \d+-(\d+)/)?.[1] ?? '');
  headers.set('X-LinuxLab-Chunk-Total', contentRange.match(/\/(\d+)$/)?.[1] ?? String(artifact.size));
  headers.set('X-LinuxLab-Artifact-Size', String(artifact.size));
  return new Response(request.method === 'HEAD' ? null : upstream.body, { status: 206, headers });
}
