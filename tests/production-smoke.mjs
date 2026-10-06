import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.PREVIEW_BASE_URL || process.env.PRODUCTION_BASE_URL || process.argv[2];
if (!baseURL) throw new Error('PREVIEW_BASE_URL or PRODUCTION_BASE_URL is required for post-deployment verification');
const origin = baseURL.replace(/\/$/, '');
const timeoutMs = Number(process.env.PRODUCTION_SMOKE_TIMEOUT_MS || 30000);
const retryMs = Number(process.env.PRODUCTION_SMOKE_RETRY_MS || 2000);
const retries = Number(process.env.PRODUCTION_SMOKE_RETRIES || 5);
const isoBaseURL = (process.env.ISO_BASE_URL || 'https://linuxterminal-iso.dshyleshkarthik7.workers.dev').replace(/\/$/, '');
const isoPath='/?image=linux4&chunkStart=0&chunkEnd=0';
const expectedIsoSize=7731200;
const expectedIsoProtocol='7';
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

if(expectedDeploySha){const deadline=Date.now()+deployWaitMs;let deployed=null;while(Date.now()<deadline){const response=await get(`${origin}/build-info.json`);if(response.ok){const info=await response.json();if(info.commit===expectedDeploySha){deployed=info;break;}}await new Promise(resolve=>setTimeout(resolve,5000));}assert.equal(deployed?.commit,expectedDeploySha,`deployment is not serving expected commit ${expectedDeploySha}`);}
const homeResponse = await get(`${origin}/`);
assert.equal(homeResponse.ok, true, `home page returned ${homeResponse.status}`);
const homeHtml = await homeResponse.text();
assert.match(homeHtml, /v86|main-v86|Linux/i, 'deployment page must expose the browser VM application');
const requiredHeaders = {
  'strict-transport-security': /max-age=31536000/i,
  'x-content-type-options': /^nosniff$/i,
  'referrer-policy': /^strict-origin-when-cross-origin$/i,
  'permissions-policy': /camera=\(\), microphone=\(\), geolocation=\(\)/i,
  'cross-origin-opener-policy': /^same-origin$/i,
  'cross-origin-resource-policy': /^same-origin$/i,
  'content-security-policy': /frame-ancestors 'none'/i,
};
for (const [name, pattern] of Object.entries(requiredHeaders)) assert.match(homeResponse.headers.get(name) || '', pattern, `deployment response missing/invalid ${name}`);
assert.match(homeResponse.headers.get('content-security-policy') || '', /connect-src[^;]*linuxterminal-iso\.dshyleshkarthik7\.workers\.dev/, 'deployment CSP must allow the canonical ISO worker');
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
  const firmware = await get(`${isoBaseURL}/?firmware=${encodeURIComponent(pin.filename)}`, { headers: { Origin: origin } });
  assert.equal(firmware.status, 200, `firmware worker returned ${firmware.status} for ${pin.filename}`);
  assert.equal(firmware.headers.get('x-linuxlab-sha256'), pin.sha256);
  assert.equal(firmware.headers.get('x-linuxlab-artifact-size'), String(pin.size));
  assert.equal(firmware.headers.get('content-length'), String(pin.size));
  const bytes = new Uint8Array(await firmware.arrayBuffer());
  assert.equal(bytes.byteLength, pin.size);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  assert.equal(actual, pin.sha256, `${pin.filename} worker SHA-256 mismatch`);
}

const isoArtifacts = manifest.artifacts.filter((artifact) => artifact.image);
assert.equal(isoArtifacts.length, 3, 'production smoke must cover all three ISO profiles');
for (const artifact of isoArtifacts) {
  const first = await get(`${isoBaseURL}/?image=${artifact.image}&chunkStart=0&chunkEnd=0`, { headers: { Origin: origin } });
  assert.equal(first.status, 200, `${artifact.image} first-byte probe returned ${first.status}`);
  assert.equal(first.headers.get('x-linuxlab-chunk-total'), String(artifact.size));
  assert.equal(first.headers.get('x-linuxlab-sha256'), artifact.sha256);
  assert.equal(first.headers.get('content-length'), '1');
  assert.equal(first.headers.get('content-range'), `bytes 0-0/${artifact.size}`);
  assert.equal((await first.arrayBuffer()).byteLength, 1);
  const last = await get(`${isoBaseURL}/?image=${artifact.image}&chunkStart=${artifact.size - 1}&chunkEnd=${artifact.size - 1}`, { headers: { Origin: origin } });
  assert.equal(last.status, 200, `${artifact.image} last-byte probe returned ${last.status}`);
  assert.equal(last.headers.get('x-linuxlab-chunk-total'), String(artifact.size));
  assert.equal(last.headers.get('x-linuxlab-sha256'), artifact.sha256);
  assert.equal(last.headers.get('content-range'), `bytes ${artifact.size - 1}-${artifact.size - 1}/${artifact.size}`);
  assert.equal((await last.arrayBuffer()).byteLength, 1);
}
for (const firmware of manifest.artifacts.filter((artifact) => artifact.release === 'v86-firmware-1')) {
  const response = await get(`${isoBaseURL}/?firmware=${encodeURIComponent(firmware.filename)}`, { headers: { Origin: origin } });
  assert.equal(response.status, 200, `${firmware.filename} returned ${response.status}`);
  assert.equal(response.headers.get('x-linuxlab-sha256'), firmware.sha256);
  assert.equal(response.headers.get('content-length'), String(firmware.size));
  assert.equal((await response.arrayBuffer()).byteLength, firmware.size);
}

const iso = await get(`${isoBaseURL}${isoPath}`, { headers: { Origin: origin, Range: 'bytes=0-0' } });
assert.equal(iso.status, 200, `Linux4 ISO probe returned ${iso.status}`);
assert.equal(iso.headers.get('x-linuxlab-worker-protocol'), expectedIsoProtocol);
assert.equal(iso.headers.get('x-linuxlab-chunk-start'), '0');
assert.equal(iso.headers.get('x-linuxlab-chunk-end'), '0');
assert.equal(iso.headers.get('x-linuxlab-chunk-total'), String(expectedIsoSize));
assert.equal(iso.headers.get('content-length'), '1');
assert.equal(iso.headers.get('accept-ranges'), 'bytes');
assert.equal(iso.headers.get('content-range'), `bytes 0-0/${expectedIsoSize}`);
assert.equal((await iso.arrayBuffer()).byteLength, 1);

const outOfBounds = await get(`${isoBaseURL}/?image=linux4&chunkStart=${expectedIsoSize}&chunkEnd=${expectedIsoSize}`, { headers: { Origin: origin } });
assert.equal(outOfBounds.status, 416);
const unknown = await get(`${isoBaseURL}/?image=unknown&chunkStart=0&chunkEnd=0`, { headers: { Origin: origin } });
assert.equal(unknown.status, 404);

console.log(`Deployment smoke checks passed: ISO endpoint + ${sitemapPaths.length} sitemap URLs`);
