import { strict as assert } from 'node:assert';

const baseURL = process.env.PRODUCTION_BASE_URL || process.argv[2];
if (!baseURL) throw new Error('PRODUCTION_BASE_URL is required for post-deployment verification');
const origin = baseURL.replace(/\/$/, '');
const timeoutMs = Number(process.env.PRODUCTION_SMOKE_TIMEOUT_MS || 30000);
const retryMs = Number(process.env.PRODUCTION_SMOKE_RETRY_MS || 2000);
const retries = Number(process.env.PRODUCTION_SMOKE_RETRIES || 5);

async function get(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs), ...options });
      if (![502, 503, 504].includes(response.status) || attempt === retries) return response;
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, retryMs));
  }
  throw lastError || new Error(`Request failed: ${url}`);
}

const sitemapResponse = await get(`${origin}/sitemap.xml`);
assert.equal(sitemapResponse.ok, true, `/sitemap.xml returned ${sitemapResponse.status}`);
assert.match(sitemapResponse.headers.get('content-type') || '', /xml/i);
const sitemap = await sitemapResponse.text();
const sitemapPaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(match => new URL(match[1]).pathname + new URL(match[1]).search);
assert.ok(sitemapPaths.length >= 30, `sitemap found only ${sitemapPaths.length} URLs`);

for (const [name, size, sha256] of [['seabios.bin',131072,'73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98'],['vgabios.bin',36352,'a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880']]) {
  const firmware = await get(origin + '/' + name);
  assert.equal(firmware.status, 200, '/' + name + ' returned ' + firmware.status);
  assert.equal(Number(firmware.headers.get('content-length')), size);
  const bytes = new Uint8Array(await firmware.arrayBuffer());
  assert.equal(bytes.byteLength, size);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  assert.equal(actual, sha256, '/' + name + ' SHA-256 mismatch');
}

const bareIso = await get(`${origin}/api/iso?image=developer`);
assert.equal(bareIso.status, 416, `bare developer ISO request returned ${bareIso.status}`);
assert.equal(bareIso.headers.get('content-range'), 'bytes */691011584');

const isoUrl = `${origin}/api/iso?image=developer&chunkStart=0&chunkEnd=0`;
const iso = await get(isoUrl, { headers: { Range: 'bytes=0-0' } });
assert.equal(iso.status, 206, `developer ISO probe returned ${iso.status}`);
assert.equal(iso.headers.get('x-linuxlab-chunk-start'), '0');
assert.equal(iso.headers.get('x-linuxlab-chunk-end'), '0');
assert.equal(iso.headers.get('x-linuxlab-chunk-total'), '691011584');
assert.equal(iso.headers.get('content-length'), '1');
assert.equal(iso.headers.get('accept-ranges'), 'bytes');
assert.equal(iso.headers.get('content-range'), 'bytes 0-0/691011584');
assert.equal((await iso.arrayBuffer()).byteLength, 1);

const outOfBounds = await get(`${origin}/api/iso?image=developer&chunkStart=691011584&chunkEnd=691011584`);
assert.equal(outOfBounds.status, 416);
const unknown = await get(`${origin}/api/iso?image=unknown&chunkStart=0&chunkEnd=0`);
assert.equal(unknown.status, 404);

console.log(`Production deployment smoke checks passed: ISO endpoint + ${sitemapPaths.length} sitemap URLs`);
