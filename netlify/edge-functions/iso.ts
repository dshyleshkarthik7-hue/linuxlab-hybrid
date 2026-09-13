type ImageName = 'developer' | 'virt' | 'linux4';
type ImageSource = { primary: string; filename: string; sha256: string; maxBytes: number; size: number };
const IMAGES: Record<ImageName, ImageSource> = {
  developer: { primary: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso', filename: 'alpine.iso', sha256: '9a4683039f356b6bdfa40897f1985b39d5a02e0f46d477e427e8262401301211', maxBytes: 64 * 1024 * 1024, size: 0 },
  virt: { primary: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/V2.00/alpine-virt-3.24.1-x86.iso', filename: 'alpine-virt-3.24.1-x86.iso', sha256: '9895695d27eabc1e2782598ff0190f7966df8317cc2afe2a6d25360e148a4209', maxBytes: 64 * 1024 * 1024, size: 51380224 },
  linux4: { primary: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v3.00/linux4.iso', filename: 'linux4.iso', sha256: 'a8ea434ab3b177c55f01275dcc1d35f52cfbee9bd44a32e74765c975b58bcc73', maxBytes: 64 * 1024 * 1024, size: 0 },
};
const imageFor = (request: Request): ImageName | null => { const value = new URL(request.url).searchParams.get('image'); return !value ? 'developer' : value === 'virt' || value === 'linux4' ? value : null; };
function cors(source: ImageSource): Headers { return new Headers({ 'Access-Control-Allow-Origin': 'https://linuxterminal.me', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range, If-Range, If-None-Match, If-Modified-Since', 'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Last-Modified, X-LinuxLab-SHA256', 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache', 'X-LinuxLab-SHA256': source.sha256 }); }
async function sha256(bytes: ArrayBuffer): Promise<string> { const digest = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join(''); }
export default async (request: Request): Promise<Response> => {
  const image = imageFor(request); if (!image) return new Response('Unknown image', { status: 404 });
  const source = IMAGES[image]; const headers = cors(source);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET' && request.method !== 'HEAD') { headers.set('Allow', 'GET, HEAD, OPTIONS'); return new Response('Method Not Allowed', { status: 405, headers }); }
  if (request.headers.has('Range')) return new Response('Range requests are disabled for verified ISO delivery', { status: 416, headers });
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30_000); timer.unref?.();
  try {
    const upstream = await fetch(source.primary, { method: request.method, headers: new Headers({ Accept: 'application/octet-stream', 'User-Agent': 'LinuxTerminal-ISO-Proxy/9.0', 'Accept-Encoding': 'identity' }), redirect: 'follow', signal: controller.signal, cache: 'no-store' });
    if (!upstream.ok) return new Response(`ISO upstream unavailable (${upstream.status})`, { status: 502, headers });
    const contentLengthHeader = upstream.headers.get('content-length');
    const contentLength = Number(contentLengthHeader || 0);
    if (contentLengthHeader && (!Number.isSafeInteger(contentLength) || contentLength !== source.size || contentLength > source.maxBytes)) return new Response('ISO upstream has an unexpected size', { status: 502, headers });
    if (request.method === 'HEAD') { if (source.size) headers.set('Content-Length', String(source.size)); return new Response(null, { status: upstream.status, headers }); }
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > source.maxBytes || (source.size > 0 && bytes.byteLength !== source.size)) return new Response('ISO upstream has an invalid size', { status: 502, headers });
    const actual = await sha256(bytes);
    if (actual.toLowerCase() !== source.sha256.toLowerCase()) { console.error(`[LinuxLab] ISO integrity mismatch for ${source.filename}: expected ${source.sha256}, got ${actual}`); return new Response('ISO integrity verification failed', { status: 502, headers: new Headers({ ...Object.fromEntries(headers), 'Cache-Control': 'no-store' }) }); }
    headers.set('Content-Length', String(bytes.byteLength)); headers.set('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream'); headers.set('ETag', `\"${source.sha256}\"`);
    return new Response(bytes, { status: 200, headers });
  } catch (error) {
    console.error('[LinuxLab] ISO proxy error:', error instanceof Error ? error.message : String(error));
    return new Response('ISO proxy temporarily unavailable', { status: 504, headers: new Headers({ ...Object.fromEntries(headers), 'Cache-Control': 'no-store' }) });
  } finally { clearTimeout(timer); }
};
export const config = { path: '/api/iso' };
