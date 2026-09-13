type ImageName = 'developer' | 'virt' | 'linux4';
type ImageSource = { primary: string; filename: string; sha256: string };
const IMAGES: Record<ImageName, ImageSource> = {
  developer: { primary: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso', filename: 'alpine.iso', sha256: '9a4683039f356b6bdfa40897f1985b39d5a02e0f46d477e427e8262401301211' },
  virt: { primary: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/V2.00/alpine-virt-3.24.1-x86.iso', filename: 'alpine-virt-3.24.1-x86.iso', sha256: '9895695d27eabc1e2782598ff0190f7966df8317cc2afe2a6d25360e148a4209' },
  linux4: { primary: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v3.00/linux4.iso', filename: 'linux4.iso', sha256: 'a8ea434ab3b177c55f01275dcc1d35f52cfbee9bd44a32e74765c975b58bcc73' },
};
const imageFor = (request: Request): ImageName | null => { const value = new URL(request.url).searchParams.get('image'); return !value ? 'developer' : value === 'virt' || value === 'linux4' ? value : null; };
function cors(source: ImageSource): Headers { return new Headers({ 'Access-Control-Allow-Origin': 'https://linuxterminal.me', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range, If-Range, If-None-Match, If-Modified-Since', 'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Last-Modified, X-LinuxLab-SHA256', 'Cache-Control': 'public, max-age=3600, s-maxage=86400', 'X-LinuxLab-SHA256': source.sha256 }); }
async function pipeWithDeadline(body: ReadableStream<Uint8Array> | null, response: Response, ms: number): Promise<Response> { if (!body) return response; const reader = body.getReader(); const stream = new ReadableStream<Uint8Array>({ async pull(controller) { const timeout = AbortSignal.timeout(ms); try { const next = await Promise.race([reader.read(), new Promise((_, reject) => timeout.addEventListener('abort', () => reject(new Error('ISO proxy body timeout')), { once: true }))]); if (next.done) controller.close(); else controller.enqueue(next.value); } catch (e) { await reader.cancel(e).catch(() => {}); controller.error(e); } }, async cancel(reason) { await reader.cancel(reason).catch(() => {}); } }); return new Response(stream, response); }
export default async (request: Request): Promise<Response> => {
  const image = imageFor(request); if (!image) return new Response('Unknown image', { status: 404 });
  const source = IMAGES[image]; const headers = cors(source);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET' && request.method !== 'HEAD') { headers.set('Allow', 'GET, HEAD, OPTIONS'); return new Response('Method Not Allowed', { status: 405, headers }); }
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const upstream = await fetch(source.primary, { method: request.method, headers: new Headers({ Accept: 'application/octet-stream', 'User-Agent': 'LinuxTerminal-ISO-Proxy/7.0', ...(request.headers.get('Range') ? { Range: request.headers.get('Range')! } : {}) }), redirect: 'follow', signal: controller.signal });
    if (!upstream.ok) return new Response(`ISO upstream unavailable (${upstream.status})`, { status: 502, headers });
    for (const name of ['Accept-Ranges','Content-Length','Content-Range','Content-Type','ETag','Last-Modified']) { const value = upstream.headers.get(name); if (value) headers.set(name, value); }
    headers.set('Content-Type', headers.get('Content-Type') || 'application/octet-stream');
    const response = new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers });
    if (request.method === 'HEAD') return response;
    clearTimeout(timer);
    return await pipeWithDeadline(response.body, response, 30000);
  } catch (error) { console.error('[LinuxLab] ISO proxy error:', error instanceof Error ? error.message : String(error)); return new Response('ISO proxy temporarily unavailable', { status: 504, headers: new Headers({ ...Object.fromEntries(headers), 'Cache-Control': 'no-store' }) }); }
  finally { clearTimeout(timer); }
};
export const config = { path: '/api/iso' };
