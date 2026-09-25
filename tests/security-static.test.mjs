import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const runtime = await readFile('src/main-v86.ts', 'utf8');
const netlify = await readFile('netlify.toml', 'utf8');
const sitemap = await readFile('public/sitemap.xml', 'utf8');
const csp = await readFile('scripts/generate-netlify-headers.mjs', 'utf8');
const realLinux = await readFile('index-v86.html', 'utf8');
const developer = await readFile('developer-alpine/index.html', 'utf8');

assert.match(runtime, /attachGuestTelemetry\s*\(\s*vm/);
assert.match(runtime, /markReadyIfIdentityVerified\s*\(/);
assert.match(runtime, /autostart:\s*false/);
assert.match(runtime, /waitForV86Loaded/);
assert.match(runtime, /wait_until_vga_screen_contains/);
assert.match(runtime, /const LOW_MEMORY_THRESHOLD_GB = 16/);
assert.match(runtime, /deviceMemory < LOW_MEMORY_THRESHOLD_GB/);
assert.equal(csp.includes('https://router.huggingface.co'), false);
assert.match(csp, /frame-ancestors 'none'/);
for (const header of ['X-Content-Type-Options','Referrer-Policy','Permissions-Policy','Cross-Origin-Opener-Policy','Cross-Origin-Resource-Policy']) assert.match(netlify, new RegExp(header), `global security header missing: ${header}`);
assert.match(csp, /const loginCsp = `[^`]*style-src 'self' 'unsafe-inline'/);
assert.match(csp, /const commonCsp = `[^`]*style-src 'self'/);
const commonCsp = csp.match(/const commonCsp = `([^`]*)`/)?.[1] || '';
assert.doesNotMatch(commonCsp, /unsafe-inline/);
assert.match(csp, /report-to csp-endpoint/);
assert.match(csp, /Reporting-Endpoints: csp-endpoint="\/api\/csp-report"/);
assert.doesNotMatch(csp, /analyticsBootstrapHash|analyticsInlineHash/);

const cloudflare = await readFile('cloudflare/iso-worker.ts', 'utf8');
const cloudflareConfig = await readFile('cloudflare/wrangler.jsonc', 'utf8');
assert.match(cloudflare, /MAX_CHUNK_BYTES/);
assert.match(cloudflare, /X-LinuxLab-Chunk-Total/);
assert.match(cloudflare, /upstream\.status !== 206/);
assert.match(cloudflare, /status: 206/);
assert.match(cloudflare, /"Cache-Control": "no-store"/);
assert.match(cloudflare, /"CDN-Cache-Control": "no-store"/);
assert.match(cloudflare, /cache: "no-store"/);
assert.match(cloudflare, /"Vary": "Origin"/);
assert.match(cloudflareConfig, /"enabled": false/);
const linux4IsoEdgeConfig = await readFile('netlify/edge-functions/linux4-iso.ts', 'utf8');
assert.match(linux4IsoEdgeConfig, /path:\s*'\/api\/iso\/linux4'/);
assert.match(linux4IsoEdgeConfig, /export default async function/);
assert.match(netlify, /path\s*=\s*"\/api\/iso\/linux4"/);
assert.match(netlify, /function\s*=\s*"linux4-iso"/);
assert.match(netlify, /path = "\/api\/v86-firmware\/\*"/);
assert.match(netlify, /function = "v86-firmware"/);
assert.doesNotMatch(netlify, /sed -i/);
assert.doesNotMatch(netlify, /CLOUDFLARE_INSIGHTS_SCRIPT_ORIGIN/);
assert.doesNotMatch(sitemap, /developer-alpine\.html/);
assert.match(sitemap, /developer-alpine\//);
assert.match(csp, /CLOUDFLARE_INSIGHTS_SCRIPT_ORIGIN/);
assert.match(csp, /CLOUDFLARE_INSIGHTS_CONNECT_ORIGIN/);
assert.doesNotMatch(csp, /https:\/\/static\.cloudflareinsights\.com|https:\/\/cloudflareinsights\.com/);

for (const [name, html, canonical] of [
  ['real-linux', realLinux, 'https://linuxterminal.me/real-linux/'],
  ['developer-alpine', developer, 'https://linuxterminal.me/developer-alpine/'],
]) {
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, /<h1\b[^>]*>/i);
  assert.match(html, /rel="canonical"/);
  assert.ok(html.includes(canonical), name + ' canonical');
  assert.doesNotMatch(html, /application\/ld\+json/i, `${name} must not contain inline JSON-LD under strict CSP`);
  assert.match(html, /href="\/learn\//);
  assert.match(html, /href="\/commands\//);
}

assert.doesNotMatch(runtime, /const ISO_BASE_URL/);
assert.match(runtime, /cdrom: ALPINE_ARTIFACT\.url/);
assert.match(runtime, /cdrom: DEVELOPER_ALPINE_ARTIFACT\.url/);
assert.match(runtime, /cdrom: LINUX4_ARTIFACT\.url/);
assert.match(runtime, /const LINUX4_PROFILE/);
assert.match(realLinux, /data-v86-profile="linux4"/);
const manifest = JSON.parse(await readFile('artifacts/manifest.json', 'utf8'));
const byImage = Object.fromEntries(manifest.artifacts.filter((item) => item.image).map((item) => [item.image, item]));
assert.equal(byImage.virt.url, 'https://linuxterminal-iso.dshyleshkarthik7.workers.dev/?image=virt');
assert.equal(byImage.developer.url, 'https://linuxterminal-iso.dshyleshkarthik7.workers.dev/?image=developer');
assert.equal(byImage.linux4.url, 'https://linuxterminal-iso.dshyleshkarthik7.workers.dev/?image=linux4');
assert.ok(byImage.virt.fallbackUrls.some((url) => url.includes('/alpine-iso-bucket/resolve/alpine-virt-3.24.1-x86.iso')));
assert.ok(byImage.developer.fallbackUrls.some((url) => url.includes('/alpine-iso-bucket/resolve/alpine.iso')));
assert.ok(byImage.linux4.fallbackUrls.some((url) => url.includes('/alpine-iso-bucket/resolve/linux4.iso')));
assert.match(realLinux, /data-v86-key="ctrl-o"/);
assert.match(byImage.linux4.url, /^https:\/\/linuxterminal-iso\.dshyleshkarthik7\.workers\.dev\/\?image=linux4$/);
assert.match(developer, /data-v86-profile="developer"/);
assert.ok(realLinux.includes('/v86-layout.css') && developer.includes('/v86-layout.css'));

console.log('Static emulator SEO/security guardrails passed');

assert.match(await readFile('netlify/edge-functions/tutor.ts','utf8'), /Tutor provider is temporarily unavailable/);
const isoWorker = await readFile('cloudflare/iso-worker.ts', 'utf8');
assert.match(isoWorker, /\^\(\[a-z0-9-\]\+\)--linuxterminal\\\.netlify\\\.app\$/i);
