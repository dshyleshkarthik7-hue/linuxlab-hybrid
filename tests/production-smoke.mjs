import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const baseURL = process.env.PRODUCTION_BASE_URL || process.argv[2];
if (!baseURL) throw new Error('PRODUCTION_BASE_URL is required for post-deployment verification');
const origin = baseURL.replace(/\/$/, '');
const timeoutMs = Number(process.env.PRODUCTION_SMOKE_TIMEOUT_MS || 30000);
const retryMs = Number(process.env.PRODUCTION_SMOKE_RETRY_MS || 2000);
const retries = Number(process.env.PRODUCTION_SMOKE_RETRIES || 5);
const isoOrigin=(process.env.ISO_BASE_URL||'').replace(/\/$/,'');
if(!isoOrigin) throw new Error('ISO_BASE_URL is required');
const isoPath='/';
const expectedDeploySha=process.env.EXPECTED_DEPLOY_SHA||'';
const deployWaitMs=Number(process.env.PRODUCTION_DEPLOY_WAIT_MS||180000);

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

if(expectedDeploySha){const deadline=Date.now()+deployWaitMs;let deployed=null;while(Date.now()<deadline){const response=await get(`${origin}/build-info.json`);if(response.ok){const info=await response.json();if(info.commit===expectedDeploySha){deployed=info;break;}}await new Promise(resolve=>setTimeout(resolve,5000));}assert.equal(deployed?.commit,expectedDeploySha,`production is not serving expected commit ${expectedDeploySha}`);}
const homeResponse = await get(`${origin}/`);
assert.equal(homeResponse.ok, true, `home page returned ${homeResponse.status}`);
const homeHtml = await homeResponse.text();
assert.match(homeHtml, /v86|main-v86|Linux/i, 'production page must expose the browser VM application');
assert.match(homeResponse.headers.get('content-security-policy') || '', /connect-src[^;]*linuxterminal-iso\.dshyleshkarthik7\.workers\.dev/, 'production CSP must allow the canonical ISO worker');
const sitemapResponse = await get(`${origin}/sitemap.xml`);
assert.equal(sitemapResponse.ok, true, `/sitemap.xml returned ${sitemapResponse.status}`);
assert.match(sitemapResponse.headers.get('content-type') || '', /xml/i);
const sitemap = await sitemapResponse.text();
const sitemapPaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(match => new URL(match[1]).pathname + new URL(match[1]).search);
assert.ok(sitemapPaths.length >= 30, `sitemap found only ${sitemapPaths.length} URLs`);

const manifest = JSON.parse(await readFile('artifacts/manifest.json', 'utf8'));
const firmwarePins = manifest.artifacts.filter((artifact) => artifact.release === 'v86-firmware-1');
assert.equal(firmwarePins.length, 2, 'firmware manifest must contain exactly two v86 firmware assets');
for (const pin of firmwarePins) {
  const firmware = await get(`${origin}/api/v86-firmware/${pin.filename}`);
  assert.equal(firmware.status, 200, `/api/v86-firmware/${pin.filename} returned ${firmware.status}`);
  assert.equal(Number(firmware.headers.get('content-length')), pin.size);
  const bytes = new Uint8Array(await firmware.arrayBuffer());
  assert.equal(bytes.byteLength, pin.size);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  assert.equal(actual, pin.sha256, `/api/v86-firmware/${pin.filename} SHA-256 mismatch`);
}

const bareIso = await get(`${isoOrigin}${isoPath}?image=developer`);
assert.equal(bareIso.status, 416, `bare developer ISO request returned ${bareIso.status}`);
assert.equal(bareIso.headers.get('content-range'), 'bytes */691011584');

const isoUrl = `${isoOrigin}${isoPath}?image=developer&chunkStart=0&chunkEnd=0`;
const iso = await get(isoUrl, { headers: { Range: 'bytes=0-0' } });
assert.equal(iso.status, 200, `developer ISO probe returned ${iso.status}`);
assert.equal(iso.headers.get('x-linuxlab-chunk-start'), '0');
assert.equal(iso.headers.get('x-linuxlab-chunk-end'), '0');
assert.equal(iso.headers.get('x-linuxlab-chunk-total'), '691011584');
assert.equal(iso.headers.get('content-length'), '1');
assert.equal(iso.headers.get('accept-ranges'), 'bytes');
assert.equal(iso.headers.get('content-range'), 'bytes 0-0/691011584');
assert.equal((await iso.arrayBuffer()).byteLength, 1);

const outOfBounds = await get(`${isoOrigin}${isoPath}?image=developer&chunkStart=691011584&chunkEnd=691011584`);
assert.equal(outOfBounds.status, 416);
const unknown = await get(`${isoOrigin}${isoPath}?image=unknown&chunkStart=0&chunkEnd=0`);
assert.equal(unknown.status, 404);

console.log(`Production deployment smoke checks passed: ISO endpoint + ${sitemapPaths.length} sitemap URLs`);
