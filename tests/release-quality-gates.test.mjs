import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const hook = await readFile('.githooks/pre-commit', 'utf8');
const installer = await readFile('scripts/install-git-hooks.mjs', 'utf8');
const netlify = await readFile('netlify.toml', 'utf8');
const runtime = await readFile('src/main-v86.ts', 'utf8');

assert.match(pkg.scripts.prepare, /install-git-hooks\.mjs/);
assert.match(pkg.scripts['test:precommit'], /test:coverage/);
assert.match(pkg.scripts['test:precommit'], /npm run build/);
assert.match(pkg.scripts['test:precommit'], /test:accessibility:axe/);
assert.match(pkg.scripts['test:precommit'], /axe-core@4\.10\.3/);
assert.match(hook, /npm run test:precommit/);
assert.match(installer, /chmod\(hook, 0o755\)/);
assert.match(installer, /core\.hooksPath/);
assert.match(netlify, /for = "\/v86\.wasm"/);
assert.match(netlify, /for = "\/seabios\.bin"/);
assert.match(netlify, /for = "\/vgabios\.bin"/);
assert.match(netlify, /Netlify-CDN-Cache-Control/);
assert.match(runtime, /wasm_path: '\/v86\.wasm'/);
console.log('release quality gates and runtime asset caching contract passed');
