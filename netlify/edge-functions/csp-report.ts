const MAX_REPORT_BYTES = 32768;
const ALLOWED_ORIGIN = 'https://linuxterminal.me';

function cors(request: Request) {
  const origin = request.headers.get('origin');
  return origin === ALLOWED_ORIGIN ? { 'access-control-allow-origin': ALLOWED_ORIGIN, vary: 'Origin' } : {};
}

export default async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors(request), 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' } });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST, OPTIONS', ...cors(request) } });
  const origin = request.headers.get('origin');
  if (origin && origin !== ALLOWED_ORIGIN) return new Response('Forbidden', { status: 403 });
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_REPORT_BYTES)) return new Response('Payload Too Large', { status: 413 });
  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_REPORT_BYTES) return new Response('Payload Too Large', { status: 413 });
    const text = new TextDecoder().decode(bytes);
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return new Response('Invalid report', { status: 400 });
    console.log('[CSP_REPORT]', JSON.stringify(parsed).slice(0, MAX_REPORT_BYTES));
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', ...cors(request) } });
  } catch {
    return new Response('Invalid report', { status: 400 });
  }
};

export const config = { path: '/api/csp-report' };
