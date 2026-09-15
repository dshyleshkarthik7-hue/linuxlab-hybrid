import { strict as assert } from 'node:assert';
import handler from '../netlify/edge-functions/iso.ts';
const sourceSize = 51380224;
const originalFetch = globalThis.fetch;
const calls: Request[] = [];
const request = new Request('https://linuxterminal.me/api/iso?image=virt', { headers: { Range: 'bytes=0-1023' } });
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => { const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url; if (url.includes('/releases/tags/')) return new Response(JSON.stringify({ assets: [{ name: 'alpine-virt-3.24.1-x86.iso', size: sourceSize, digest: 'sha256:9895695d27eabc1e2782598ff0190f7966df8317cc2afe2a6d25360e148a4209' }] }), { status: 200 }); calls.push(new Request(url, init)); return new Response(new Uint8Array(1024), { status: 206, headers: { 'content-length': '1024', 'content-range': `bytes 0-1023/${sourceSize}`, 'content-type': 'application/octet-stream' } }); };
try { const response = await handler(request); assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), `bytes 0-1023/${sourceSize}`); assert.equal(response.headers.get('content-length'), '1024'); assert.equal(calls.length, 1); assert.equal(calls[0].headers.get('range'), 'bytes=0-1023'); const invalid = await handler(new Request('https://linuxterminal.me/api/iso?image=virt', { headers: { Range: 'bytes=bad' } })); assert.equal(invalid.status, 416); console.log('ISO edge Range behavior passed'); } finally { globalThis.fetch = originalFetch; }
