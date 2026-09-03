const PRIMARY_ISO_URL =
  'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso';
const FALLBACK_ISO_URL =
  'https://huggingface.co/datasets/shyleshkarthikd/alpine-iso/resolve/main/alpine.iso?download=true';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers':
    'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified, X-LinuxLab-ISO-Source',
};

const TIMEOUT_MS = 15_000;

async function fetchIso(url: string, request: Request): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = new Headers({ 'User-Agent': 'LinuxLab-Edge-Stream/1.2' });
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
  if (wantsRange) {
    return response.status === 206 && response.headers.has('Content-Range');
  }
  return response.status >= 200 && response.status < 300;
}

function withSource(upstream: Response, source: string, method: string): Response {
  const headers = new Headers(upstream.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  headers.set('X-LinuxLab-ISO-Source', source);
  return new Response(method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD, OPTIONS', ...corsHeaders } });
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const wantsRange = request.headers.has('Range');
  const sources = [
    ['github-release', PRIMARY_ISO_URL],
    ['huggingface-fallback', FALLBACK_ISO_URL],
  ] as const;
  const failures: string[] = [];

  for (const [name, url] of sources) {
    try {
      const response = await fetchIso(url, request);
      if (usable(response, wantsRange)) return withSource(response, name, request.method);
      failures.push(`${name}=${response.status}`);
    } catch (error) {
      failures.push(`${name}=network-error`);
      console.warn('[LinuxLab] ISO source failed', name, error);
    }
  }

  console.error('[LinuxLab] ISO sources unavailable:', failures.join(', '));
  return new Response('ISO upstream unavailable', {
    status: 502,
    headers: { ...corsHeaders, 'X-LinuxLab-ISO-Source': 'unavailable' },
  });
}
