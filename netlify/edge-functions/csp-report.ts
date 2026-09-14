const MAX_REPORT_BYTES = 32768;
export default async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST, OPTIONS' } });
  const length = request.headers.get('content-length');
  if (length && (!/^\\d+$/.test(length) || Number(length) > MAX_REPORT_BYTES)) return new Response('Payload Too Large', { status: 413 });
  try { const bytes = await request.arrayBuffer(); if (bytes.byteLength > MAX_REPORT_BYTES) return new Response('Payload Too Large', { status: 413 }); const text = new TextDecoder().decode(bytes); JSON.parse(text); console.log('[CSP_REPORT]', text); return new Response('', { status: 204, headers: { 'Cache-Control': 'no-store' } }); } catch { return new Response('Invalid report', { status: 400 }); }
};
export const config = { path: '/api/csp-report' };
