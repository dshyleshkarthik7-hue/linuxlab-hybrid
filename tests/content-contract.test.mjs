import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const read = path => readFile(join(root, path), 'utf8');
const exists = async path => { try { await readFile(join(root, path)); return true; } catch { return false; } };

const challenges = await read('challenges/index.html');
const challengeScript = await read('public/challenges/challenges.js');
const challengeBuilder = await read('scripts/commands/build-database.mjs');
assert.match(challengeScript, /fetch\('\/challenge-sets\.json'/, 'challenge UI must load the generated canonical challenge catalog');
assert.match(challengeScript, /const id = String\(cmd\.id\)/, 'challenge completion must use the stable canonical record ID');
assert.match(challengeBuilder, /id:record\.id/, 'generated challenge records must preserve canonical IDs');
assert.match(challengeBuilder, /catalog-manifest\.json/, 'catalog manifest must be generated from the canonical dataset');
assert.match(challenges, /\/challenges\/challenges\.js/, 'challenge page must load the external challenge catalog script');
assert.doesNotMatch(challenges, /cmd_json|json_data|commands_json/, 'challenge page must not contain unresolved generator placeholders');

for (const duplicate of ['about','contact','challenges','commands','quiz','open-source-iso']) {
  assert.equal(await exists(`public/${duplicate}/index.html`), false, `public/${duplicate}/index.html duplicates a root page`);
}
assert.equal(await exists('public/developer.html'), false, 'orphan developer page must not ship');
assert.equal(await exists('public/session.js'), false, 'dead session feature must not ship');
assert.equal(await exists('public/linux-cd-command/index.html'), false, 'stale orphan SEO page must not ship');
assert.equal(await exists('public/linux-ls-command/index.html'), false, 'stale orphan SEO page must not ship');
assert.equal(await exists('public/robots.txt'), true, 'public/robots.txt is required by the production contract');
assert.equal(await exists('public/sitemap.xml'), true, 'public/sitemap.xml is required by the production contract');
assert.equal(await exists('scripts/generate-netlify-headers.mjs'), true, 'security headers must have a canonical build-time generator');
// Linux 4 ISO delivery is intentionally handled by the canonical Cloudflare worker
// configured in artifacts/manifest.json. Do not reintroduce the duplicate Netlify relay.
assert.equal(await exists('netlify/edge-functions/linux4-iso.ts'), false, 'Linux 4 delivery must not add a duplicate Netlify ISO relay');
assert.equal(await exists('netlify/edge-functions/v86-firmware.ts'), true, 'firmware delivery must be routed through Netlify Edge');

const publicEntries = await readdir(join(root, 'public'), { withFileTypes: true });
for (const entry of publicEntries.filter(e => e.isDirectory())) {
  assert.equal(await exists(`public/${entry.name}/index.html`), false, `public/${entry.name}/index.html is a duplicate page source`);
}

const progress = await read('progress/index.html');
const progressScript = await read('public/progress.js');
assert.match(progress, /<script type="module" src="\.\/progress\.js"><\/script>/, 'progress page must load the shared local progress ledger');
assert.match(progressScript, /window\.LinuxProgress/, 'shared progress ledger must expose the LinuxProgress API');
const simulator = await read('simulator.html');
const realLinux = await read('index-v86.html');
const developerAlpine = await read('developer-alpine/index.html');
assert.doesNotMatch(realLinux, /application\/ld\+json/i, 'real Linux page must not contain inline JSON-LD under strict CSP');
assert.doesNotMatch(developerAlpine, /application\/ld\+json/i, 'developer Alpine page must not contain inline JSON-LD under strict CSP');
assert.doesNotMatch(simulator, /<script(?![^>]+src=)[^>]*>/i, 'simulator must not contain inline scripts');
assert.doesNotMatch(simulator, /application\/ld\+json/i, 'simulator must not contain inline JSON-LD under strict CSP');

const packageJson = JSON.parse(await read('package.json'));
assert.match(packageJson.scripts.predev || '', /build-database\.mjs/, 'Development startup must regenerate catalog assets');
const beginner = await read('beginner/index.html');
assert.match(beginner, /200 Essential Linux Commands/, 'Beginner page must retain its separate 200-command curriculum');
assert.match(beginner, /\.\.\/commands\//, 'Beginner page must link to the complete catalog separately');
const commandEntry = await read('commands-entry.html');
assert.match(commandEntry, /complete 6,161-command reference independently of the beginner curriculum/i, 'Full catalog page must remain distinct from beginner curriculum');
assert.match(commandEntry, /href=\"\/beginner\/\">Open the 200-command beginner path/, 'Full catalog page should offer a separate beginner path');
const headers = await read('netlify.toml');
const cspGenerator = await read('scripts/generate-netlify-headers.mjs');
assert.match(cspGenerator, /Strict-Transport-Security/);
assert.doesNotMatch(headers, /path = "\/api\/iso\/linux4"/, 'Linux 4 ISO is served by the Cloudflare worker, not a duplicate Netlify relay');
assert.match(headers, /path = "\/api\/v86-firmware(?:\/\*|")/, "firmware route must accept the configured wildcard path");
const isoFetcher = await read('src/core/verified-iso-fetch.ts');
const isoCache = await read('src/core/iso-cache.ts');
assert.doesNotMatch(isoFetcher, /cache:\s*['"]no-store['"]/);
assert.match(isoFetcher, /readIsoChunkCache/);
assert.match(isoFetcher, /writeIsoChunkCache/);
assert.match(isoFetcher, /clearIsoArtifactCache/);
assert.match(isoCache, /artifact\.sha256/);
assert.match(isoCache, /content-length/);
const vmPolicy = await read('src/engine/VMResourcePolicy.ts');
assert.match(vmPolicy, /developer: \{ memoryMiB: 1024/);
const cloudflareWorker = await read('cloudflare/iso-worker.ts');
assert.match(cloudflareWorker, /linuxterminal\.me/);
assert.match(cloudflareWorker, /MAX_CHUNK_BYTES/);
assert.match(cloudflareWorker, /getFirmware/);
assert.match(cspGenerator, /Cross-Origin-Embedder-Policy/);
assert.match(cspGenerator, /const scriptSrc = \[\"'self'\", \"'wasm-unsafe-eval'\"/);
assert.match(cspGenerator, /Content-Security-Policy:/);

console.log('Content contract checks passed');
