import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const read = path => readFile(join(root, path), 'utf8');
const exists = async path => { try { await readFile(join(root, path)); return true; } catch { return false; } };

const challenges = await read('challenges/index.html');
const challengeScript = await read('public/challenges/challenges.js');
const challengeCommandEntries = [...challengeScript.matchAll(/\[['"]([^'"]+)['"],['"]([^'"]+)['"\](?:,|\])/g)].map(m => `${m[1]}|${m[2]}`);
assert.equal(challengeCommandEntries.length, 50, 'challenge catalog must contain exactly 50 commands (100 challenges)');
assert.match(challengeScript, /const COMMANDS=\[/, 'challenge catalog must expose its command data in the external JavaScript asset');
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
assert.equal(await exists('public/_headers'), true, 'public/_headers is required by the production contract');

const publicEntries = await readdir(join(root, 'public'), { withFileTypes: true });
for (const entry of publicEntries.filter(e => e.isDirectory())) {
  assert.equal(await exists(`public/${entry.name}/index.html`), false, `public/${entry.name}/index.html is a duplicate page source`);
}

const simulator = await read('simulator.html');
assert.doesNotMatch(simulator, /<script(?![^>]+src=)[^>]*>/i, 'simulator must not contain inline scripts');
assert.doesNotMatch(simulator, /application\/ld\+json/i, 'simulator must not contain inline JSON-LD under strict CSP');
const headers = await read('netlify.toml');
assert.match(headers, /Strict-Transport-Security/);
assert.match(headers, /Cross-Origin-Embedder-Policy/);
assert.match(headers, /script-src 'self' 'wasm-unsafe-eval'/);

console.log('Content contract checks passed');
