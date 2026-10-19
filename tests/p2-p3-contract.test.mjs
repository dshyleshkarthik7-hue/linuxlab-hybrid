import { readFileSync, existsSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const required = ['index.html', 'package.json', 'netlify.toml', 'public/sitemap.xml', 'public/robots.txt', '.github/workflows/ci.yml'];
for (const file of required) assert.ok(existsSync(file), `missing ${file}`);
assert.equal(existsSync('sitemap.xml'), false, 'duplicate root sitemap must not be present');
assert.equal(existsSync('robots.txt'), false, 'duplicate root robots file must not be present');

for (const file of ['index.html', '404.html', 'simulator.html', 'index-v86.html', 'developer-alpine/index.html', 'progress/index.html']) {
  const html = readFileSync(file, 'utf8');
  assert.match(html, /<html[^>]+lang=/i, `${file}: missing lang`);
  assert.match(html, /<meta[^>]+name=["']viewport/i, `${file}: missing viewport`);
  assert.match(html, /<title>[^<]+<\/title>/i, `${file}: missing title`);
}

const netlify = readFileSync('netlify.toml', 'utf8');
assert.match(netlify, /command\s*=\s*"npm run build"/);
assert.doesNotMatch(netlify, /command\s*=\s*"npm run build && node scripts\/write-build-info\.mjs"/, 'Netlify must not overwrite generated build-info metadata');

const generatedHeaders = readFileSync('scripts/generate-netlify-headers.mjs', 'utf8');
for (const header of ['Cross-Origin-Embedder-Policy','Strict-Transport-Security','Permissions-Policy']) assert.match(generatedHeaders, new RegExp(header));

const robots = readFileSync('public/robots.txt', 'utf8');
assert.match(robots, /^Sitemap:\s*https:\/\/linuxterminal\.me\/sitemap\.xml$/m);

for (const workflow of ['.github/workflows/ci.yml', '.github/workflows/deploy-cloudflare.yml']) {
  const yaml = readFileSync(workflow, 'utf8');
  assert.match(yaml, /workflow_dispatch:/, `${workflow}: production deployment must be manually gated`);
  assert.match(yaml, /confirm_production_deploy|run_production_smoke/, `${workflow}: explicit production deployment confirmation is required`);
}

const progress = readFileSync('progress/index.html', 'utf8');
const progressScripts = [...progress.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
assert.deepEqual(progressScripts, ['./progress.js'], 'progress page must load exactly one page-local progress module');
assert.equal(existsSync('src/home.css'), false, 'dead src/home.css must not return');
assert.equal(existsSync('home.css'), true, 'home.css is the canonical static home stylesheet (synced into public at build)');

const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
assert.match(ci, /Production smoke \(explicitly approved release gate\)/);
assert.match(ci, /EXPECTED_DEPLOY_SHA:\s*\$\{\{ github\.sha \}\}/);
assert.match(ci, /inputs\.run_production_smoke == true/, 'production smoke must require explicit manual approval');
assert.doesNotMatch(ci, /if:\s*github\.event_name == 'push'\s*\n\s*env:\s*\n\s*PRODUCTION_BASE_URL:/, 'production smoke must not run automatically on main pushes');
assert.match(ci, /bash -n iso-builder\/build-linuxlab-gcc\.sh/, 'CI must execute the ISO builder shell syntax check');

const cloudflare = readFileSync('.github/workflows/deploy-cloudflare.yml', 'utf8');
assert.match(cloudflare, /inputs\.confirm_production_deploy == true/, 'Cloudflare production deployment must require explicit manual approval');
assert.doesNotMatch(cloudflare, /workflow_run:/, 'Cloudflare production deployment must not run automatically after CI');
assert.match(cloudflare, /Verify Cloudflare worker health/, 'Cloudflare deploy workflow must verify worker health');

console.log('P2/P3 production contract checks passed');
