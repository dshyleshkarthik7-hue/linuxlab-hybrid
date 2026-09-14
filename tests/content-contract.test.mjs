import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const read = path => readFile(join(root, path), 'utf8');
const exists = async path => { try { await read(path); return true; } catch { return false; } };

const catalog = await read('src/commands/commandCatalog.ts');
const edgeCatalog = await read('netlify/edge-functions/command-data.ts');
const commandNames = ['pwd','ls','cd','grep','find','chmod','ps','free','df','tar','ip','ping','curl','ssh','gcc','make','python3','node','apk','systemctl','seq'];
assert.match(catalog, /COMMAND_LESSONS\.length !== 200/);
assert.match(edgeCatalog, /COMMAND_INDEX\.length !== 200/);
for (const command of commandNames) {
  const escaped = command.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&');
  assert.match(catalog, new RegExp(`name: ['"]${escaped}['"]`), `${command} missing from canonical catalog`);
  assert.match(edgeCatalog, new RegExp(`name: ['"]${escaped}['"]`), `${command} missing from edge catalog`);
}

// The client and edge indexes intentionally contain the same 200 commands.
// Compare the complete ordered projection so drift cannot hide behind a
// handful of spot checks.
const canonicalEntries = [...catalog.matchAll(/\{ name: '([^']+)', category: '([^']+)'/g)].map(m => `${m[1]}|${m[2]}`);
const edgeEntries = [...edgeCatalog.matchAll(/\{ name: '([^']+)', description: '([^']+)', example:/g)].map(m => m[1]);
const clientSource = await read('public/commands-index.js');
const clientEntries = [...clientSource.matchAll(/\['([^']+)'\s*,\s*'([^']+)'\]/g)].map(m => `${m[1]}|${m[2]}`);
assert.equal(canonicalEntries.length, 200, 'canonical command catalog must contain exactly 200 entries');
assert.equal(edgeEntries.length, 200, 'edge command catalog must contain exactly 200 entries');
assert.equal(clientEntries.length, 200, 'client command catalog must contain exactly 200 entries');
assert.deepEqual(clientEntries, canonicalEntries, 'client command index must exactly match canonical catalog');
assert.deepEqual(edgeEntries, canonicalEntries.map(entry => entry.split('|')[0]), 'edge command names must exactly match canonical catalog');

const commandIndex = await read('commands/index.html');
assert.match(commandIndex, /commands-index\.js/);
assert.doesNotMatch(commandIndex, /<article\b/i, 'command landing page must not contain a stale hardcoded command list');
assert.doesNotMatch(commandIndex, /\/commands\/(?:date|clear|man|nano|vim|vi)\//, 'command landing page contains a phantom route');
assert.match(clientSource, /COMMANDS/);
assert.match(clientSource, /COMMANDS\.length/);

const edge = await read('netlify/edge-functions/commands.ts');
assert.match(edge, /indexHtml\(\)/);
assert.match(edge, /lessonHtml\(item/);
assert.match(edge, /\/commands\/\*/);
assert.match(edge, /commands-index\.js/);
assert.doesNotMatch(edge, /<script(?![^>]+src=)[^>]*>/i, 'command Edge Function must not emit inline script');

const tutor = await read('netlify/edge-functions/tutor.ts');
assert.match(tutor, /LinuxTerminal Tutor/);
assert.match(tutor, /HF_TOKEN/);
assert.match(tutor, /fallback/);
const beginner = await read('beginner/index.html');
assert.match(beginner, /LinuxTerminal<b>\.me<\/b>/);
assert.match(beginner, /id="tutor"/);
assert.match(beginner, /id="tutor-ask"/);
assert.match(await read('src/beginner.ts'), /\/api\/tutor/);

for (const page of ['index.html','beginner/index.html','intermediate/index.html','expert/index.html','about/index.html','contact/index.html','curriculum/index.html','commands/index.html','quiz/index.html','challenges/index.html','open-source-iso/index.html']) {
  const html = await read(page);
  assert.match(html, /<head>/i, `${page} missing head`);
  assert.match(html, /<title>[^<]+<\/title>/i, `${page} missing title`);
  assert.match(html, /rel=["']canonical["']/i, `${page} missing canonical`);
}

for (const duplicate of ['about','contact','challenges','commands','quiz','open-source-iso']) {
  assert.equal(await exists(`public/${duplicate}/index.html`), false, `public/${duplicate}/index.html duplicates a root page`);
}
assert.equal(await exists('public/developer.html'), false, 'orphan developer page must not ship');
assert.equal(await exists('public/session.js'), false, 'dead session feature must not ship');
assert.equal(await exists('public/linux-cd-command/index.html'), false, 'stale orphan SEO page must not ship');
assert.equal(await exists('public/linux-ls-command/index.html'), false, 'stale orphan SEO page must not ship');
assert.equal(await exists('robots.txt'), true, 'root robots.txt is required by the production contract');
assert.equal(await exists('sitemap.xml'), true, 'root sitemap.xml is required by the production contract');
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
assert.match(headers, /\/api\/tutor/);
const vite = await read('vite.config.ts');
for (const entry of ['about/index.html','contact/index.html','commands/index.html','quiz/index.html','challenges/index.html','open-source-iso/index.html']) assert.match(vite, new RegExp(entry.replace(/[.*+?^${}()|[\\]\\]/g,'\\\\$&')));

console.log('Content contract checks passed: canonical pages, exact command-index synchronization, CSP, headers and required production metadata.');
