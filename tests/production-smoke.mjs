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
assert.match(sitemapResponse.headers.get('content-type') || '', /xml/i, '/sitemap.xml must be XML');
const sitemap = await sitemapResponse.text();
const sitemapPaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(match => new URL(match[1]).pathname + new URL(match[1]).search);
assert.ok(sitemapPaths.length >= 30, `sitemap must expose the indexable site surface; found ${sitemapPaths.length} URLs`);
assert.ok(sitemapPaths.includes('/commands/pwd.html'), 'sitemap must use canonical .html command URLs');
assert.ok(!sitemapPaths.some(path => /^\/commands\/[^.]+\/$/.test(path)), 'sitemap must not advertise legacy command slash URLs');

const commands = ['pwd','ls','cd','mkdir','cat','cp','mv','rm','grep','find','sed','awk','chmod','chown','ps','top','df','du','tar','curl','ssh','ip','ping','git','head','tail'];
for (const command of commands) {
  const response = await get(`${origin}/commands/${command}/`, { redirect: 'manual', retryTransient: false });
  assert.ok([301, 308].includes(response.status), `/commands/${command}/ must redirect; got ${response.status}`);
  const location = response.headers.get('location');
  assert.ok(location, `/commands/${command}/ redirect must have Location`);
  const target = new URL(location, origin);
  assert.equal(target.pathname, `/commands/${command}.html`, `/commands/${command}/ must redirect to canonical .html`);
  assert.equal(target.search, '', `/commands/${command}/ must not preserve query strings`);
}

const pages = new Map();
for (const path of [...new Set(sitemapPaths)]) {
  const response = await get(origin + path);
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
  if (/\.(txt|xml)$/.test(path)) continue;
  assert.match(response.headers.get('content-type') || '', /html/i, `${path} must be HTML`);
  pages.set(path, await response.text());
}

function assetUrls(html, tag, attribute) {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attribute}=["']([^"']+)["']`, 'gi');
  return [...html.matchAll(re)].map(match => match[1]);
}
for (const [path, html] of pages) {
  assert.doesNotMatch(html, /<script(?![^>]+\bsrc=)[^>]*>/i, `${path} must not contain inline scripts`);
  assert.doesNotMatch(html, /<style[\s>]/i, `${path} must not contain inline styles`);
  assert.match(html, /<title>[^<]{3,200}<\/title>/i, `${path} must have a title`);
  assert.match(html, /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,320}["']/i, `${path} must have a useful meta description`);
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1];
  assert.ok(canonical, `${path} must have a canonical URL`);
  assert.equal(new URL(canonical).origin, 'https://linuxterminal.me', `${path} canonical must use production HTTPS`);
  for (const src of assetUrls(html, 'script', 'src')) {
    const response = await get(new URL(src, origin + path));
    assert.equal(response.ok, true, `${path} script ${src} failed with ${response.status}`);
  }
  for (const href of assetUrls(html, 'link', 'href')) {
    if (!/\.css(?:$|[?#])/i.test(href)) continue;
    const response = await get(new URL(href, origin + path));
    assert.equal(response.ok, true, `${path} stylesheet ${href} failed with ${response.status}`);
    assert.match(response.headers.get('content-type') || '', /css/i, `${path} stylesheet ${href} must be CSS`);
  }
}

assert.ok(pages.has('/'), 'sitemap must include the homepage');
assert.match(pages.get('/') || '', /WHY LEARN IT\?/i);
assert.match(pages.get('/') || '', /WHY THIS SITE\?/i);
assert.match(pages.get('/beginner/') || '', /200 Linux Commands/i);
assert.match(pages.get('/quiz/') || '', /500 Linux command questions/i);
assert.match(pages.get('/certificate/') || '', /server-verified/i);
assert.match(pages.get('/verify/') || '', /PUBLIC VERIFICATION/i);
assert.match(pages.get('/challenges/') || '', /100 Linux challenges/i);
console.log(`Production deployment smoke checks passed: ${pages.size} sitemap pages + ${commands.length} canonical command redirects`);
