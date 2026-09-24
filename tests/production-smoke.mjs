import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.PRODUCTION_BASE_URL || process.argv[2];
if (!baseURL) throw new Error('PRODUCTION_BASE_URL is required for post-deployment verification');
const origin = baseURL.replace(/\/$/, '');
const timeoutMs = Number(process.env.PRODUCTION_SMOKE_TIMEOUT_MS || 30000);
const retryMs = Number(process.env.PRODUCTION_SMOKE_RETRY_MS || 2000);
const retries = Number(process.env.PRODUCTION_SMOKE_RETRIES || 5);
const isoPath='/api/iso/linux4';
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
const requiredHeaders = {
  'strict-transport-security': /max-age=31536000/i,
  'x-content-type-options': /^nosniff$/i,
  'referrer-policy': /^strict-origin-when-cross-origin$/i,
  'permissions-policy': /camera=\(\), microphone=\(\), geolocation=\(\)/i,
  'cross-origin-opener-policy': /^same-origin$/i,
  'cross-origin-resource-policy': /^same-origin$/i,
  'content-security-policy': /frame-ancestors 'none'/i,
};
for (const [name, pattern] of Object.entries(requiredHeaders)) assert.match(homeResponse.headers.get(name) || '', pattern, `production response missing/invalid ${name}`);
assert.match(homeResponse.headers.get('content-security-policy') || '', /connect-src[^;]*linuxterminal-iso\.dshyleshkarthik7\.workers\.dev/, 'production CSP must allow the canonical ISO worker');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  await page.goto(`${origin}/real-linux/`, { waitUntil: 'domcontentloaded', timeout: Number(process.env.PRODUCTION_VM_PAGE_TIMEOUT_MS || 30000) });
  const health = page.locator('#v86-health');
  await health.waitFor({ state: 'attached', timeout: Number(process.env.PRODUCTION_VM_BOOT_TIMEOUT_MS || 120000) });
  await page.waitForFunction(() => document.querySelector('#v86-health')?.getAttribute('data-state') === 'ready', { timeout: Number(process.env.PRODUCTION_VM_BOOT_TIMEOUT_MS || 120000) });
  assert.equal(await health.getAttribute('data-state'), 'ready', 'deployed v86 runtime did not reach ready state');
} finally { await browser.close(); }
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
  assert.equal(Number(firmware.headers.get('x-content-size')), pin.size, 'verified firmware size header must match manifest');
  const bytes = new Uint8Array(await firmware.arrayBuffer());
  assert.equal(bytes.byteLength, pin.size);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  assert.equal(actual, pin.sha256, `/api/v86-firmware/${pin.filename} SHA-256 mismatch`);
}

const bareIso = await get(`${origin}${isoPath}`);
assert.equal(bareIso.status, 416, `bare developer ISO request returned ${bareIso.status}`);
assert.equal(bareIso.headers.get('content-range'), 'bytes */7731200');

const isoUrl = `${origin}${isoPath}?chunkStart=0&chunkEnd=0`;
const iso = await get(isoUrl, { headers: { Range: 'bytes=0-0' } });
assert.equal(iso.status, 206, `Linux4 ISO probe returned ${iso.status}`);
assert.equal(iso.headers.get('x-linuxlab-chunk-start'), '0');
assert.equal(iso.headers.get('x-linuxlab-chunk-end'), '0');
assert.equal(iso.headers.get('x-linuxlab-chunk-total'), '7731200');
assert.equal(iso.headers.get('content-length'), '1');
assert.equal(iso.headers.get('accept-ranges'), 'bytes');
assert.equal(iso.headers.get('content-range'), 'bytes 0-0/7731200');
assert.equal((await iso.arrayBuffer()).byteLength, 1);

const outOfBounds = await get(`${origin}${isoPath}?chunkStart=7731200&chunkEnd=7731200`);
assert.equal(outOfBounds.status, 416);
const unknown = await get(`${origin}${isoPath}?image=unknown&chunkStart=0&chunkEnd=0`);
assert.equal(unknown.status, 404);

console.log(`Production deployment smoke checks passed: ISO endpoint + ${sitemapPaths.length} sitemap URLs`);
