import { readFileSync, existsSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const required = ['index.html','about/index.html','contact/index.html','curriculum/index.html','beginner/index.html','intermediate/index.html','expert/index.html','public/sitemap.xml','public/robots.txt'];
for (const file of required) assert.ok(existsSync(file), `missing ${file}`);
assert.equal(existsSync('sitemap.xml'), false, 'duplicate root sitemap must not be present');
assert.equal(existsSync('robots.txt'), false, 'duplicate root robots file must not be present');
for (const file of required.filter(f => f.endsWith('.html'))) {
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
const workflows = ['.github/workflows/deploy-cloudflare.yml'];
for (const workflow of workflows) {
  const yaml = readFileSync(workflow, 'utf8');
  assert.doesNotMatch(yaml, /\bworkflow_dispatch:\s*$/m, `${workflow}: manual production bypass is not permitted`);
}
const progress = readFileSync('progress/index.html', 'utf8');
const progressScripts = [...progress.matchAll(/<script\b[^>]+src=["']([^"']*progress\.js)["'][^>]*>/gi)].map(match => match[1]);
assert.deepEqual(progressScripts, ['./progress.js'], 'progress page must load exactly one page-local progress module');
assert.equal(existsSync('src/home.css'), false, 'dead src/home.css must not return');
assert.equal(existsSync('public/home.css'), true, 'public/home.css is the canonical static home stylesheet');
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
assert.match(ci, /Production smoke \(main deployment gate\)/);
assert.match(ci, /EXPECTED_DEPLOY_SHA:\s*\$\{\{ github\.sha \}\}/);
assert.match(ci, /github\.event_name == 'push'/, 'production smoke must run only from push events, never manual workflow dispatch');
assert.match(ci, /bash -n iso-builder\/build-linuxlab-gcc\.sh/, 'CI must execute the ISO builder shell syntax check');
console.log('P2/P3 production contract checks passed');
