const PRIMARY_ISO_URL =
  'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso';
const FALLBACK_ISO_URL =
  'https://huggingface.co/datasets/shyleshkarthikd/alpine-iso/resolve/main/alpine.iso?download=true';

const TIMEOUT_MS = 15_000;
const ALLOWED_METHODS = new Set(['GET', 'HEAD']);

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers':
      'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified, X-LinuxLab-ISO-Source',
    'Vary': 'Origin',
  });

  // Same-origin requests do not need CORS. Only explicitly configured origins
  // are allowed for cross-origin reuse of this large streaming endpoint.
  const origin = request.headers.get('Origin');
  const allowed = (Deno.env.get('LINUXLAB_ALLOWED_ORIGINS') || 'https://linuxterminal.me,https://www.linuxterminal.me')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  if (origin && allowed.includes(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function validRange(value: string | null): boolean {
  if (!value) return true;
  return /^bytes=\d*-\d*(?:,\d*-\d*)*$/.test(value.trim());
}

async function fetchIso(url: string, request: Request): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = new Headers({ 'User-Agent': 'LinuxLab-Edge-Stream/1.3' });
  const range = request.headers.get('Range');
  if (range) headers.set('Range', range);

  try {
    return await fetch(url, {
      method: request.method,
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function usable(response: Response, wantsRange: boolean): boolean {
  return wantsRange
    ? response.status === 206 && response.headers.has('Content-Range')
    : response.status >= 200 && response.status < 300;
}

function withSource(upstream: Response, source: string, request: Request): Response {
  const headers = new Headers(upstream.headers);
  corsHeaders(request).forEach((value, key) => headers.set(key, value));
  headers.set('X-LinuxLab-ISO-Source', source);
  headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export default async function handler(request: Request): Promise<Response> {
  const cors = corsHeaders(request);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!ALLOWED_METHODS.has(request.method)) {
    return new Response('Method Not Allowed', { status: 405, headers: new Headers({ ...Object.fromEntries(cors), Allow: 'GET, HEAD, OPTIONS' }) });
  }
  if (!validRange(request.headers.get('Range'))) {
    return new Response('Invalid Range header', { status: 416, headers: cors });
  }

  const wantsRange = request.headers.has('Range');
  const sources = [
    ['github-release', PRIMARY_ISO_URL],
    ['huggingface-fallback', FALLBACK_ISO_URL],
  ] as const;
  const failures: string[] = [];

  for (const [name, url] of sources) {
    try {
      const response = await fetchIso(url, request);
      if (usable(response, wantsRange)) return withSource(response, name, request);
      failures.push(`${name}=${response.status}`);
    } catch (error) {
      failures.push(`${name}=network-error`);
      console.warn('[LinuxLab] ISO source failed', name, error);
    }
  }

  console.error('[LinuxLab] ISO sources unavailable:', failures.join(', '));
  const headers = corsHeaders(request);
  headers.set('X-LinuxLab-ISO-Source', 'unavailable');
  return new Response('ISO upstream unavailable', { status: 502, headers });
}
