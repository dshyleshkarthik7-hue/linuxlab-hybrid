const MAX_REPORT_BYTES = 32768;
const MAX_REPORTS_PER_WINDOW = 20;
const RATE_WINDOW_MS = 60_000;
const reportBuckets = new Map<string, { count: number; resetAt: number }>();

type EdgeContext = { ip?: string };

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  if (origin === 'https://linuxterminal.me' || origin === 'https://www.linuxterminal.me') {
    return { 'access-control-allow-origin': origin, vary: 'Origin' };
  }
  return {};
}

function clientKey(context: EdgeContext): string {
  return context.ip?.trim() || 'unknown';
}

function rateLimited(context: EdgeContext): boolean {
  const key = clientKey(context);
  const now = Date.now();
  const bucket = reportBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    reportBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_REPORTS_PER_WINDOW;
}

export default async (request: Request, context: EdgeContext): Promise<Response> => {
  const headers = cors(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' } });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST, OPTIONS', ...headers } });
  if (rateLimited(context)) return new Response('Too Many Requests', { status: 429, headers: { ...headers, 'Retry-After': '60', 'Cache-Control': 'no-store' } });

  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_REPORT_BYTES)) return new Response('Payload Too Large', { status: 413, headers });
  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_REPORT_BYTES) return new Response('Payload Too Large', { status: 413, headers });
    const text = new TextDecoder().decode(bytes);
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return new Response('Invalid report', { status: 400, headers });
    console.log('[CSP_REPORT]', JSON.stringify(parsed).slice(0, MAX_REPORT_BYTES));
    return new Response(null, { status: 204, headers: { ...headers, 'Cache-Control': 'no-store' } });
  } catch {
    return new Response('Invalid report', { status: 400, headers });
  }
};

export const config = { path: '/api/csp-report' };
