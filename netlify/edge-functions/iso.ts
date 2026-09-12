const TIMEOUT_MS = 120_000;
type ImageName = 'developer' | 'virt' | 'linux4';
type ImageSource = { primary: string; fallback?: string; sha256: string; filename: string };

const IMAGES: Record<ImageName, ImageSource> = {
  developer: { primary: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso', fallback: 'https://api.github.com/repos/dshyleshkarthik7-hue/linuxlab-hybrid/releases/assets/533942157', filename: 'alpine.iso', sha256: '9a4683039f356b6bdfa40897f1985b39d5a02e0f46d477e427e8262401301211' },
  virt: { primary: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/V2.00/alpine-virt-3.24.1-x86.iso', fallback: 'https://api.github.com/repos/dshyleshkarthik7-hue/linuxlab-hybrid/releases/assets/552238914', filename: 'alpine-virt-3.24.1-x86.iso', sha256: '9895695d27eabc1e2782598ff0190f7966df8317cc2afe2a6d25360e148a4209' },
  linux4: { primary: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v3.00/linux4.iso', fallback: 'https://huggingface.co/datasets/shyleshkarthikd/linux4/resolve/main/linux4.iso?download=true', filename: 'linux4.iso', sha256: 'a8ea434ab3b177c55f01275dcc1d35f52cfbee9bd44a32e74765c975b58bcc73' },
};

function imageFor(request: Request): ImageName | null {
  const image = new URL(request.url).searchParams.get('image');
  return !image ? 'developer' : image === 'virt' || image === 'linux4' ? image : null;
}

function cors(): Headers {
  return new Headers({
    'Access-Control-Allow-Origin': 'https://linuxterminal.me',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, If-Range, If-None-Match, If-Modified-Since',
    'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Last-Modified, X-LinuxLab-SHA256',
  });
}

async function upstreamFetch(source: string, request: Request, signal: AbortSignal): Promise<Response> {
  const headers = new Headers({ 'User-Agent': 'LinuxTerminal-ISO-Proxy/3.0', Accept: 'application/octet-stream' });
  for (const name of ['Range', 'If-Range', 'If-None-Match', 'If-Modified-Since']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return fetch(source, { method: request.method, headers, redirect: 'follow', signal });
}

function fail(status: number, headers: Headers, message = 'ISO unavailable') {
  headers.set('Cache-Control', 'no-store');
  return new Response(message, { status, headers });
}

export default async function handler(request: Request): Promise<Response> {
  const headers = cors();
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET' && request.method !== 'HEAD') { headers.set('Allow', 'GET, HEAD, OPTIONS'); return fail(405, headers, 'Method Not Allowed'); }
  const image = imageFor(request);
  if (!image) return fail(404, headers, 'Unknown image');

  const source = IMAGES[image];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let upstream = await upstreamFetch(source.primary, request, controller.signal);
    if (!upstream.ok && source.fallback) upstream = await upstreamFetch(source.fallback, request, controller.signal);
    if (!upstream.ok) return fail(upstream.status, headers, `ISO upstream unavailable (${upstream.status})`);

    for (const name of ['Accept-Ranges', 'Content-Length', 'Content-Range', 'Content-Type', 'ETag', 'Last-Modified']) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set('X-LinuxLab-SHA256', source.sha256);
    headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    headers.set('Content-Type', headers.get('Content-Type') || 'application/octet-stream');
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers });
  } catch (error) {
    console.error('[LinuxLab] ISO proxy failed', error instanceof Error ? error.message : String(error));
    return fail(502, headers, 'ISO proxy temporarily unavailable');
  } finally {
    clearTimeout(timer);
  }
}
