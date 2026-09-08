const PRIMARY_ISO_URL = 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso';
const FALLBACK_ISO_URL = 'https://huggingface.co/datasets/shyleshkarthikd/alpine-iso/resolve/main/alpine.iso?download=true';
const TIMEOUT_MS = 45_000;
const MAX_RANGE_HEADER_LENGTH = 128;
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified, X-LinuxLab-ISO-Source',
};

function isValidRangeHeader(range: string): boolean {
  if (range.length > MAX_RANGE_HEADER_LENGTH || range.includes(',')) return false;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || (!match[1] && !match[2])) return false;
  return !(match[1] && match[2] && Number(match[1]) > Number(match[2]));
}

async function fetchIso(url: string, request: Request): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = new Headers();
  const range = request.headers.get('Range');
  if (range) headers.set('Range', range);
  try {
    return await fetch(url, { method: request.method, headers, redirect: 'follow', signal: controller.signal });
  } finally { clearTimeout(timeout); }
}

function validUpstream(response: Response, wantsRange: boolean): boolean {
  if (wantsRange) return response.status === 206 && /^bytes \d+-\d+\/\d+$/i.test(response.headers.get('Content-Range') || '');
  return response.status >= 200 && response.status < 300;
}

function proxyResponse(upstream: Response, source: string, method: string): Response {
  const headers = new Headers();
  for (const key of ['Content-Type','Content-Length','Content-Range','Accept-Ranges','ETag','Last-Modified']) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (!headers.has('Accept-Ranges')) headers.set('Accept-Ranges', 'bytes');
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  headers.set('X-LinuxLab-ISO-Source', source);
  headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  return new Response(method === 'HEAD' ? null : upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method Not Allowed', { status: 405, headers: { ...corsHeaders, Allow: 'GET, HEAD, OPTIONS' } });

  const range = request.headers.get('Range');
  if (range && !isValidRangeHeader(range)) return new Response('Invalid Range header', { status: 416, headers: { ...corsHeaders, 'Accept-Ranges': 'bytes' } });

  const wantsRange = Boolean(range);
  const failures: string[] = [];
  for (const [name, url] of [['github-release', PRIMARY_ISO_URL], ['fallback-mirror', FALLBACK_ISO_URL]] as const) {
    try {
      const response = await fetchIso(url, request);
      if (validUpstream(response, wantsRange)) return proxyResponse(response, name, request.method);
      failures.push(`${name}:${response.status}`);
      await response.body?.cancel();
    } catch { failures.push(`${name}:network-error`); }
  }
  return new Response('Linux image temporarily unavailable', {
    status: 502,
    headers: { ...corsHeaders, 'X-LinuxLab-ISO-Source': 'unavailable', 'X-LinuxLab-Upstream-Failures': failures.join(','), 'Cache-Control': 'no-store' }
  });
}
