const MAX_REPORT_BYTES = 32768;

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  if (origin === 'https://linuxterminal.me' || origin === 'https://www.linuxterminal.me') return { 'access-control-allow-origin': origin, vary: 'Origin' };
  return {};
}

export default async (request: Request): Promise<Response> => {
  const headers = cors(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' } });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST, OPTIONS', ...headers } });
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
