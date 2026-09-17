import { strict as assert } from 'node:assert';

const baseURL = process.env.PRODUCTION_BASE_URL || process.argv[2];
if (!baseURL) throw new Error('PRODUCTION_BASE_URL is required for post-deployment verification');
const origin = baseURL.replace(/\/$/, '');
const timeoutMs = Number(process.env.PRODUCTION_SMOKE_TIMEOUT_MS || 60000);
const retryMs = Number(process.env.PRODUCTION_SMOKE_RETRY_MS || 15000);
const retries = Number(process.env.PRODUCTION_SMOKE_RETRIES || 24);

async function get(url) {
  let last;
  const u = new URL(url);
  u.searchParams.set('_production_smoke', Date.now().toString());
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
      if (r.ok || ![404, 502, 503, 504].includes(r.status) || i === retries) return r;
      last = r;
    } catch (e) {
      if (i === retries) throw e;
    }
    await new Promise(r => setTimeout(r, retryMs));
  }
  return last;
}

const commands = ['pwd','ls','cd','mkdir','cat','cp','mv','rm','grep','find','sed','awk','chmod','chown','ps','top','df','du','tar','curl','ssh','ip','ping','git','head','tail'];
const routes = ['/', '/beginner/', '/commands/', '/learn/', '/learn/linux-basics/', '/quiz/', '/challenges/', '/certificate/', '/verify/', '/about/', '/contact/', '/login/', '/simulator.html', '/real-linux/', '/robots.txt', '/sitemap.xml', ...commands.map(name => `/commands/${name}.html`)];
const pages = new Map();

for (const path of routes) {
  const r = await get(origin + path);
  assert.equal(r?.ok, true, `${path} returned ${r?.status}`);
  if (/\.(txt|xml)$/.test(path)) continue;
  assert.match(r.headers.get('content-type') || '', /html/i, `${path} must be HTML`);
  pages.set(path, await r.text());
}

const catalogScript = await get(origin + '/commands.js');
assert.equal(catalogScript?.ok, true, `/commands.js returned ${catalogScript?.status}`);
const catalogJs = await catalogScript.text();
const catalogEntries = [...catalogJs.matchAll(/\['[^']+','[^']+'\]/g)];
assert.equal(catalogEntries.length, 200, `commands.js must contain exactly 200 catalogue entries; found ${catalogEntries.length}`);

const beginnerJs = await get(origin + '/src/beginner.ts');
assert.notEqual(beginnerJs?.status, 200, 'Source TypeScript must not be deployed as a public asset');

for (const [path, html] of pages) {
  assert.doesNotMatch(html, /<script(?![^>]+\bsrc=)[^>]*>/i, `${path} must not contain inline scripts`);
  assert.doesNotMatch(html, /<style[\s>]/i, `${path} must not contain inline styles`);
  for (const src of [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(x => x[1])) {
    const r = await get(new URL(src, origin + path));
    assert.equal(r?.ok, true, `${path} script ${src} failed`);
  }
  for (const href of [...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["']/gi)].map(x => x[1])) {
    const r = await get(new URL(href, origin + path));
    assert.equal(r?.ok, true, `${path} stylesheet ${href} failed`);
    assert.match(r.headers.get('content-type') || '', /css/i, `${path} stylesheet ${href} must be CSS`);
  }
}

assert.match(pages.get('/') || '', /WHY LEARN IT\?/i);
assert.match(pages.get('/') || '', /WHY THIS SITE\?/i);
assert.match(pages.get('/') || '', /Why is Linux worth learning\?/i);
assert.match(pages.get('/') || '', /Why LinuxTerminal\.me\?/i);
assert.match(pages.get('/beginner/') || '', /200 Linux Commands/i);
assert.match(pages.get('/quiz/') || '', /500 Linux command questions/i);
assert.match(pages.get('/certificate/') || '', /server-verified/i);
assert.match(pages.get('/verify/') || '', /PUBLIC VERIFICATION/i);
assert.match(pages.get('/challenges/') || '', /100 Linux challenges/i);
assert.doesNotMatch(pages.get('/real-linux/') || '', /network relay downloads VM images/i);
console.log(`Production deployment smoke checks passed: ${commands.length} canonical lessons + 200-command catalogue`);
