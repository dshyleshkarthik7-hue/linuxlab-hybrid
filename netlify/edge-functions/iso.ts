const TIMEOUT_MS = 120_000;

type ImageName = 'developer' | 'virt' | 'linux4';
type ImageSource = { primary: string; fallback?: string; sha256: string; filename: string };

const IMAGES: Record<ImageName, ImageSource> = {
  developer: {
    primary: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso',
    fallback: 'https://api.github.com/repos/dshyleshkarthik7-hue/linuxlab-hybrid/releases/assets/533942157',
    filename: 'alpine.iso',
    sha256: '9a4683039f356b6bdfa40897f1985b39d5a02e0f46d477e427e8262401301211',
  },
  virt: {
    primary: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/V2.00/alpine-virt-3.24.1-x86.iso',
    fallback: 'https://api.github.com/repos/dshyleshkarthik7-hue/linuxlab-hybrid/releases/assets/552238914',
    filename: 'alpine-virt-3.24.1-x86.iso',
    sha256: '9895695d27eabc1e2782598ff0190f7966df8317cc2afe2a6d25360e148a4209',
  },
  linux4: {
    primary: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v3.00/linux4.iso',
    fallback: 'https://huggingface.co/datasets/shyleshkarthikd/linux4/resolve/main/linux4.iso?download=true',
    filename: 'linux4.iso',
    sha256: 'a8ea434ab3b177c55f01275dcc1d35f52cfbee9bd44a32e74765c975b58bcc73',
  },
};

const FORWARDED_HEADERS = ['Content-Type', 'Content-Length', 'ETag', 'Last-Modified'] as const;

function parseImage(request: Request): ImageName | null {
  const image = new URL(request.url).searchParams.get('image');
  if (!image) return 'developer';
  return image === 'virt' || image === 'linux4' ? image : null;
}

function corsHeaders(): Headers {
  return new Headers({
    'Access-Control-Allow-Origin': new URL('https://linuxterminal.me').origin,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Length, ETag, Last-Modified, X-LinuxLab-SHA256',
  });
}

function unavailable(status: number, cors: Headers): Response {
  const headers = new Headers(cors);
  headers.set('Cache-Control', 'no-store');
  return new Response(`ISO unavailable (${status})`, { status, headers });
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchComplete(source: string, signal: AbortSignal): Promise<Response> {
  return fetch(source, {
    method: 'GET',
    headers: { 'User-Agent': 'LinuxTerminal-Verified-ISO/2.0', Accept: 'application/octet-stream' },
    redirect: 'follow',
    signal,
  });
}

export default async function handler(request: Request): Promise<Response> {
  const cors = corsHeaders();
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const headers = new Headers(cors); headers.set('Allow', 'GET, HEAD, OPTIONS');
    return new Response('Method Not Allowed', { status: 405, headers });
  }

  const image = parseImage(request);
  if (!image) return new Response('Unknown image', { status: 404, headers: cors });

  // Integrity verification is only meaningful for the complete artifact. A range
  // relay would allow unverified bytes to reach the VM, so partial requests fail closed.
  if (request.headers.has('Range')) {
    const headers = new Headers(cors);
    headers.set('Accept-Ranges', 'none');
    headers.set('Cache-Control', 'no-store');
    return new Response('Range requests are disabled; the complete pinned ISO must be verified before use', { status: 416, headers });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const source = IMAGES[image];
    let upstream: Response;
    try {
      upstream = await fetchComplete(source.primary, controller.signal);
    } catch (error) {
      if (!source.fallback) throw error;
      upstream = await fetchComplete(source.fallback, controller.signal);
    }
    if (!upstream.ok) {
      if (!source.fallback || upstream.url === source.fallback) return unavailable(upstream.status, cors);
      upstream = await fetchComplete(source.fallback, controller.signal);
    }
    if (!upstream.ok) return unavailable(upstream.status, cors);

    const bytes = await upstream.arrayBuffer();
    const actual = await sha256Hex(bytes);
    if (actual.toLowerCase() !== source.sha256.toLowerCase()) {
      console.error('[LinuxLab] ISO integrity verification failed', { image, filename: source.filename });
      return unavailable(502, cors);
    }

    const headers = new Headers(cors);
    for (const name of FORWARDED_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set('Content-Type', headers.get('Content-Type') ?? 'application/octet-stream');
    headers.set('Content-Length', String(bytes.byteLength));
    headers.set('Accept-Ranges', 'none');
    headers.set('X-LinuxLab-SHA256', actual);
    headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return new Response(request.method === 'HEAD' ? null : bytes, { status: 200, headers });
  } catch (error) {
    console.error('[LinuxLab] verified ISO relay failed', error);
    return unavailable(502, cors);
  } finally {
    clearTimeout(timer);
  }
}
