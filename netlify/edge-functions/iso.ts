const PRIMARY_ISO_URL = 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso';
const FALLBACK_ISO_URL = 'https://huggingface.co/datasets/shyleshkarthikd/alpine-iso/resolve/main/alpine.iso?download=true';
const TIMEOUT_MS = 15_000;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified, X-LinuxLab-ISO-Source',
};

async function fetchIso(url: string, request: Request): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = new Headers({ 'User-Agent': 'LinuxLab-ISO-Proxy/1.0' });
  const range = request.headers.get('Range');
  if (range) headers.set('Range', range);
  try {
    return await fetch(url, { method: request.method, headers, redirect: 'follow', signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function usable(response: Response, wantsRange: boolean): boolean {
  return wantsRange ? response.status === 206 && response.headers.has('Content-Range') : response.ok;
}

function proxyResponse(upstream: Response, source: string, method: string): Response {
  const headers = new Headers(upstream.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  headers.set('X-LinuxLab-ISO-Source', source);
  headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  return new Response(method === 'HEAD' ? null : upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD, OPTIONS', ...corsHeaders } });
  }
  const wantsRange = request.headers.has('Range');
  const failures: string[] = [];
  for (const [name, url] of [['github-release', PRIMARY_ISO_URL], ['fallback-mirror', FALLBACK_ISO_URL]] as const) {
    try {
      const response = await fetchIso(url, request);
      if (usable(response, wantsRange)) return proxyResponse(response, name, request.method);
      await response.body?.cancel();
      failures.push(name + ':' + response.status);
    } catch {
      failures.push(name + ':network-error');
    }
  }
  return new Response('Linux image temporarily unavailable', { status: 502, headers: { ...corsHeaders, 'X-LinuxLab-ISO-Source': 'unavailable', 'Cache-Control': 'no-store' } });
}