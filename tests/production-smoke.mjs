import { strict as assert } from 'node:assert';

const baseURL = process.env.PRODUCTION_BASE_URL || process.argv[2];
if (!baseURL) throw new Error('PRODUCTION_BASE_URL is required for post-deployment verification');
const origin = baseURL.replace(/\/$/, '');
const timeoutMs = Number(process.env.PRODUCTION_SMOKE_TIMEOUT_MS || 60000);
const deployRetryMs = Number(process.env.PRODUCTION_SMOKE_RETRY_MS || 15000);
const deployRetryCount = Number(process.env.PRODUCTION_SMOKE_RETRIES || 12);

async function fetchWithTimeout(url) {
  let lastResponse;
  let lastError;
  for (let attempt = 0; attempt <= deployRetryCount; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok || ![404, 502, 503, 504].includes(response.status) || attempt === deployRetryCount) {
        return response;
      }
      lastResponse = response;
    } catch (error) {
      lastError = error;
      if (attempt === deployRetryCount) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, deployRetryMs));
  }
  if (lastResponse) return lastResponse;
  throw lastError || new Error(`Unable to fetch ${url}`);
}

const routes = [
  '/',
  '/beginner/',
  '/commands/',
  '/commands/pwd/',
  '/quiz/',
  '/challenges/',
  '/about/',
  '/contact/',
  '/login/',
  '/simulator.html',
  '/real-linux/',
  '/index-v86.html',
  '/robots.txt',
  '/sitemap.xml',
];

async function assertHTML(path) {
  const response = await fetchWithTimeout(origin + path);
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
  assert.match(response.headers.get('content-type') || '', /html/i, `${path} must be HTML`);
  return response.text();
}

async function assertAsset(path) {
  const response = await fetchWithTimeout(path);
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
  return response;
}

const pages = new Map();
for (const path of routes) {
  if (/\.(txt|xml)$/.test(path)) {
    const response = await fetchWithTimeout(origin + path);
    assert.equal(response.ok, true, `${path} returned ${response.status}`);
    continue;
  }
  pages.set(path, await assertHTML(path));
}

for (const [path, html] of pages) {
  const links = [...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const href of links) {
    const assetURL = new URL(href, origin + path).toString();
    assert.equal(new URL(assetURL).origin, new URL(origin).origin, `${path} references an external stylesheet: ${href}`);
    const response = await assertAsset(assetURL);
    assert.match(response.headers.get('content-type') || '', /css/i, `${assetURL} must be served as CSS`);
  }

  const scripts = [...html.matchAll(/<script\b([^>]*)\bsrc=["']([^"']+)["'][^>]*>/gi)].map((match) => match[2]);
  assert.doesNotMatch(html, /<script(?![^>]+\bsrc=)[^>]*>/i, `${path} must not contain inline scripts`);
  for (const src of scripts) {
    const assetURL = new URL(src, origin + path).toString();
    const url = new URL(assetURL);
    if (url.origin !== new URL(origin).origin && !url.href.startsWith('https://identity.netlify.com/')) continue;
    const response = await assertAsset(assetURL);
    assert.match(response.headers.get('content-type') || '', /(javascript|ecmascript|text\/plain)/i, `${assetURL} must be served as JavaScript`);
  }
}

const homepage = pages.get('/') || '';
assert.match(homepage, /LinuxTerminal/i);
assert.doesNotMatch(homepage, /<style[\s>]/i, 'production homepage must not contain inline styles');

const beginner = pages.get('/beginner/') || '';
assert.match(beginner, /200 Linux Commands/i);
assert.match(beginner, /command-catalog-body/i);
assert.match(beginner, /identity\.netlify\.com/i);

const quiz = pages.get('/quiz/') || '';
assert.match(quiz, /500 Linux quiz questions/i);
assert.doesNotMatch(quiz, /<style[\s>]/i, 'production quiz must not contain inline styles');

const login = pages.get('/login/') || '';
assert.match(login, /Netlify Identity|Sign in/i);

console.log('Production deployment smoke checks passed');
