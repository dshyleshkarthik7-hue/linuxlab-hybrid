import { strict as assert } from 'node:assert';
import handler from '../netlify/edge-functions/iso.ts';

const sourceSize = 51_380_224;
const originalFetch = globalThis.fetch;
const calls: Request[] = [];

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes('/releases/tags/')) {
    return new Response(JSON.stringify({
      assets: [{
        name: 'alpine-virt-3.24.1-x86.iso',
        size: sourceSize,
        digest: 'sha256:9895695d27eabc1e2782598ff0190f7966df8317cc2afe2a6d25360e148a4209',
      }],
    }), { status: 200 });
  }
  const request = new Request(url, init);
  calls.push(request);
  const value = request.headers.get('range');
  const match = /^bytes=(\d+)-(\d*)$/.exec(value ?? '');
  const start = match ? Number(match[1]) : 0;
  const end = match ? (match[2] ? Math.min(Number(match[2]), sourceSize - 1) : sourceSize - 1) : sourceSize - 1;
  const length = end - start + 1;
  return new Response(new Uint8Array(Math.min(length, 1024)), {
    status: match ? 206 : 200,
    headers: {
      'content-length': String(length),
      ...(match ? { 'content-range': `bytes ${start}-${end}/${sourceSize}` } : {}),
      'content-type': 'application/octet-stream',
    },
  });
};

try {
  const response = await handler(new Request('https://linuxterminal.me/api/iso?image=virt', {
    headers: { Range: 'bytes=0-1023' },
  }));
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), `bytes 0-1023/${sourceSize}`);
  assert.equal(response.headers.get('content-length'), '1024');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.get('range'), 'bytes=0-1023');
  assert.equal(new URL(calls[0].url).searchParams.get('image'), 'virt');

  const chunked = await handler(new Request('https://linuxterminal.me/api/iso?image=virt&chunkStart=0&chunkEnd=1023', {
    headers: { Range: 'bytes=0-1023' },
  }));
  assert.equal(chunked.status, 206);
  assert.equal(chunked.headers.get('content-length'), '1024');

  const openEnded = await handler(new Request('https://linuxterminal.me/api/iso?image=virt', {
    headers: { Range: 'bytes=1024-' },
  }));
  assert.equal(openEnded.status, 206);
  assert.equal(openEnded.headers.get('content-range'), `bytes 1024-${sourceSize - 1}/${sourceSize}`);

  const invalid = await handler(new Request('https://linuxterminal.me/api/iso?image=virt', {
    headers: { Range: 'bytes=bad' },
  }));
  assert.equal(invalid.status, 416);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('ISO edge Range behavior passed');
