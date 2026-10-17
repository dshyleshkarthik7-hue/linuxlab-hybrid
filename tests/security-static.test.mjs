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
assert.match(runtime, /this\.serial \+= ch;\s*if \(this\.serial\.length > 65536\)/, 'serial transcript must avoid copying the entire buffer for every byte');
assert.match(runtime, /vm\.serial0_send/, 'prefilled commands must be sent to the guest serial input');
assert.match(runtime, /const LOW_MEMORY_THRESHOLD_GB = 4/);
assert.match(runtime, /deviceMemory < LOW_MEMORY_THRESHOLD_GB/);
assert.equal(csp.includes('https://router.huggingface.co'), false);
assert.match(csp, /frame-ancestors 'none'/);
for (const header of ['X-Content-Type-Options','Referrer-Policy','Permissions-Policy','Cross-Origin-Opener-Policy','Cross-Origin-Resource-Policy']) assert.match(csp, new RegExp(header), `global security header missing from generated headers: ${header}`);
// Check the effective policy declarations without requiring a specific JS quote style.
assert.match(csp, /kind === 'login'.*style-src 'self' 'unsafe-inline'/,
  'login CSP must allow inline styles required by the identity provider');
assert.match(csp, /const connectSrc = \[.*workerOrigin/,
  'browser network access must use the configured worker origin rather than arbitrary upstreams');
assert.doesNotMatch(csp, /https:\/\/\*\.amazonaws\.com|https:\/\/\*\.hf\.co|https:\/\/github\.com|https:\/\/release-assets\.githubusercontent\.com|https:\/\/objects\.githubusercontent\.com/,
  'CSP must not allow every AWS bucket');
assert.doesNotMatch(csp, /sha256-Ob\/z7smzKJGFdMGHiYHvik0pzOqdUCQ9Qa2zSrkvshs=/,
  'CSP must not contain an unexplained static script hash');
assert.match(csp, /inlineScriptHashes\(html\)/,
  'inline script hashes must be generated for the exact HTML file');
assert.match(csp, /kind === 'vm' \? \["'wasm-unsafe-eval'"\]/,
  'wasm-unsafe-eval must be scoped to VM pages');
assert.match(csp, /htmlEntries\.flatMap/,
  'each HTML path must receive one page-specific CSP rather than overlapping CSPs');
assert.match(csp, /report-to csp-endpoint/);
assert.match(csp, /Reporting-Endpoints: csp-endpoint="\/api\/csp-report"/);
assert.doesNotMatch(csp, /analyticsBootstrapHash|analyticsInlineHash/);

const cloudflare = await readFile('cloudflare/iso-worker.ts', 'utf8');
const cloudflareConfig = await readFile('cloudflare/wrangler.jsonc', 'utf8');
assert.match(cloudflare, /MAX_CHUNK_BYTES/);
assert.match(cloudflare, /X-LinuxLab-Chunk-Total/);
assert.match(cloudflare, /upstream\.status === 200 && image\.size <= MAX_FULL_UPSTREAM_BYTES/);
assert.match(cloudflare, /status === 206/);
assert.doesNotMatch(cloudflare, /"Cache-Control": "no-store"/);
assert.doesNotMatch(cloudflare, /"CDN-Cache-Control": "no-store"/);
assert.doesNotMatch(cloudflare, /cache: "no-store"/);
assert.match(cloudflare, /"Vary": "Origin"/);
assert.match(cloudflareConfig, /"enabled": true/);
assert.doesNotMatch(netlify, /v86-firmware/, 'firmware must be served as static build-verified assets, not through a runtime proxy');
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

const tutorSource = await readFile('netlify/edge-functions/tutor.ts', 'utf8');
assert.match(tutorSource, /if \(!token\) return json\(\{ error: 'Tutor provider is not configured[\s\S]*?503/);
assert.doesNotMatch(tutorSource, /model: 'local-fallback'/, 'Tutor must not disguise a missing or failed provider as a successful response');
const isoWorker = await readFile('cloudflare/iso-worker.ts', 'utf8');
assert.match(isoWorker, /\^\(\[a-z0-9-\]\+\)--linuxterminal\\\.netlify\\.app\$/i);


assert.match(csp, /MAX_HEADER_LINE_BYTES = 8192/, 'generated response header lines must have a hard size limit');
assert.match(csp, /type && !\['module', 'text\/javascript', 'application\/javascript'/, 'non-executable script data such as JSON-LD must not be hashed into script-src');
assert.match(csp, /const indent = \(block\) => block\.split\('\\n'\)\.map\(\(line\) => '  ' \+ line\)\.join\('\\n'\)/, 'every emitted response header line must be indented in _headers syntax');
assert.match(csp, /const htmlCache = 'CDN-Cache-Control:/, 'HTML cache directive must be defined');
assert.match(csp, /indent\(security \+ '\\nReporting-Endpoints/,
  'global security headers must be emitted using the shared indentation helper');
