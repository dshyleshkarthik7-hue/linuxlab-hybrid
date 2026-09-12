import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const read = path => readFile(join(root, path), 'utf8');

const catalog = await read('src/commands/commandCatalog.ts');
const edgeCatalog = await read('netlify/edge-functions/command-data.ts');
const commandNames = ['pwd','ls','cd','grep','find','chmod','ps','free','df','tar','ip','ping','curl','ssh','gcc','make','python3','node','apk','systemctl','seq'];
assert.match(catalog, /COMMAND_LESSONS\.length !== 200/);
assert.match(edgeCatalog, /COMMAND_INDEX\.length !== 200/);
for (const command of commandNames) {
  assert.match(catalog, new RegExp(`name: ['"]${command.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}['"]`), `${command} missing from canonical catalog`);
  assert.match(edgeCatalog, new RegExp(`name: ['"]${command.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}['"]`), `${command} missing from edge catalog`);
}

const commandIndex = await read('public/commands/index.html');
assert.match(commandIndex, /commands\.js/);
assert.doesNotMatch(commandIndex, /<script(?![^>]+src=)[^>]*>/i, 'command index must not contain inline script');
const commandJs = await read('public/commands/commands.js');
assert.match(commandJs, /COMMANDS/);
assert.match(commandJs, /seq/);

const edge = await read('netlify/edge-functions/commands.ts');
assert.match(edge, /indexHtml\(\)/);
assert.match(edge, /lessonHtml\(item/);
assert.match(edge, /\/commands\/\*/);

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

const simulator = await read('simulator.html');
assert.doesNotMatch(simulator, /<script(?![^>]+src=)[^>]*>/i, 'simulator must not contain inline scripts');
assert.doesNotMatch(simulator, /application\/ld\+json/i, 'simulator must not contain inline JSON-LD under strict CSP');
assert.match(simulator, /LinuxTerminal<span class="badge">\.me/);

const headers = await read('public/_headers');
assert.match(headers, /Cross-Origin-Embedder-Policy/);
const netlify = await read('netlify.toml');
assert.match(netlify, /script-src 'self' 'wasm-unsafe-eval'/);
assert.match(netlify, /\/api\/tutor/);

const vite = await read('vite.config.ts');
for (const entry of ['about/index.html','contact/index.html','commands/index.html','quiz/index.html','challenges/index.html','open-source-iso/index.html']) assert.match(vite, new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
const telemetry = await read('src/v86-telemetry.ts');
assert.match(telemetry, /__LT_IDENTITY__/);
assert.match(telemetry, /__LT_ID_END__/);
assert.match(telemetry, /ID=alpine/);
const coverage = await read('tests/coverage-threshold.mjs');
assert.match(coverage, /--test-coverage-functions=(?:70|75)/);
assert.match(coverage, /--test-coverage-lines=(?:70|75)/);
assert.match(coverage, /--test-coverage-branches=(?:50|60)/);

console.log('Content contract checks passed: canonical 200-command curriculum, CSP-safe command index, AI Tutor integration, SEO metadata, learning flow and guest telemetry.');
