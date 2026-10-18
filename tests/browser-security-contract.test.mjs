import { strict as assert } from 'node:assert';
import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function ensureDeployHeaders() {
  if (existsSync('dist/_headers') && readFileSync('dist/_headers', 'utf8').includes('script-src')) {
    return;
  }
  mkdirSync('dist', { recursive: true });
  // Seed a minimal set of HTML pages so per-route CSP blocks are generated.
  const seeds = [
    'index.html',
    'index-v86.html',
    'simulator.html',
    'login/index.html',
    'beginner/index.html',
  ];
  for (const rel of seeds) {
    if (!existsSync(rel)) continue;
    const dest = join('dist', rel);
    mkdirSync(join(dest, '..'), { recursive: true });
    try { copyFileSync(rel, dest); } catch { /* ignore missing optional seeds */ }
  }
  const gen = spawnSync(process.execPath, ['scripts/generate-netlify-headers.mjs'], { encoding: 'utf8' });
  if (gen.status !== 0) {
    throw new Error('Could not generate dist/_headers: ' + (gen.stderr || gen.stdout || '').slice(0, 500));
  }
}

ensureDeployHeaders();

const main = readFileSync('src/main-v86.ts', 'utf8');
const headers = readFileSync('dist/_headers', 'utf8');
assert.doesNotMatch(main, /innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML\s*\(/);
assert.match(main, /replaceChildren\(document\.createTextNode\(text\)\)/);
assert.match(headers, /Cross-Origin-Opener-Policy:\s*same-origin/);
assert.match(headers, /Cross-Origin-Embedder-Policy:\s*credentialless/);
assert.match(headers, /script-src[^\n]*https:\/\/netlify-rum\.netlify\.app/);
assert.match(headers, /\/login(?:\/|\/index\.html)?[\s\S]*?style-src[^\n]*'unsafe-inline'/);
assert.match(headers, /connect-src[^\n]*https:\/\/linuxterminal-iso\.dshyleshkarthik7\.workers\.dev/);
assert.match(headers, /Permissions-Policy:\s*camera=\(\)/);
assert.match(readFileSync('progress/index.html', 'utf8'), /<script type="module" src="\.\/progress\.js"><\/script>/);
console.log('Browser security regression contract checks passed');

const v86 = readFileSync('src/main-v86.ts', 'utf8');
assert.match(v86, /net_device:\s*\{ type: 'none' \}/);
assert.match(v86, /visibilitychange/);
assert.match(v86, /destroy\?\./);
console.log('VM lifecycle/network regression contract passed');

assert.match(v86, /verified artifact \$\{artifact\.version\}/);
assert.match(v86, /Verified \$\{this\.profile\.expectedGuest\} artifact identity was not established/);
console.log('Verified-artifact readiness contract passed');
