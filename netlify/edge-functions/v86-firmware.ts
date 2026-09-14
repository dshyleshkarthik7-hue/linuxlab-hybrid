const ASSETS: Record<string, { url: string; size: number; sha256: string }> = {
  '/seabios.bin': {
    url: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v86-firmware-1/seabios.bin',
    size: 131072,
    sha256: '73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98',
  },
  '/vgabios.bin': {
    url: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v86-firmware-1/vgabios.bin',
    size: 36352,
    sha256: 'a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880',
  },
};

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default async function handler(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const asset = ASSETS[pathname.replace(/^\/api\/v86-firmware/, '')];
  if (!asset) return new Response('Not found', { status: 404 });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  try {
    const upstream = await fetch(asset.url, { redirect: 'follow', cache: 'no-store' });
    if (!upstream.ok) return new Response(`Firmware upstream returned ${upstream.status}`, { status: 502 });
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength !== asset.size) throw new Error(`size ${bytes.byteLength} != ${asset.size}`);
    const actual = await sha256Hex(bytes);
    if (actual !== asset.sha256) throw new Error(`SHA-256 ${actual} != ${asset.sha256}`);

    const headers = new Headers({
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Verified': 'sha256',
      'X-Content-SHA256': actual,
      'X-Content-Size': String(bytes.byteLength),
    });
    return request.method === 'HEAD' ? new Response(null, { status: 200, headers }) : new Response(bytes, { status: 200, headers });
  } catch (error) {
    console.error(`v86 firmware verification failed for ${pathname}: ${error instanceof Error ? error.message : String(error)}`);
    return new Response('Verified firmware asset unavailable', { status: 502 });
  }
}
