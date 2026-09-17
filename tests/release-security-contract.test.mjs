import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const artifacts = await readFile('src/core/artifacts.ts', 'utf8');
const vm = await readFile('src/main-v86.ts', 'utf8');
const boundary = await readFile('docs/PRODUCTION_SECURITY_BOUNDARY.md', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

for (const name of ['ALPINE_ARTIFACT', 'DEVELOPER_ALPINE_ARTIFACT', 'LINUX4_ARTIFACT']) {
  const block = artifacts.slice(artifacts.indexOf(`export const ${name}`), artifacts.indexOf('\nexport const', artifacts.indexOf(`export const ${name}`) + 1) === -1 ? artifacts.length : artifacts.indexOf('\nexport const', artifacts.indexOf(`export const ${name}`) + 1));
  assert.match(block, /sha256:\s*'[0-9a-f]{64}'/i, `${name} must have a fixed SHA-256 digest`);
  assert.match(block, /size:\s*\d+/, `${name} must have a fixed size`);
}

assert.match(vm, /net_device:\s*\{\s*type:\s*'none'\s*\}/, 'v86 production profile must keep networking disabled');
assert.match(vm, /fetchVerifiedIso\(/, 'v86 must verify the complete ISO before boot');
assert.match(boundary, /not equivalent to a server-side microVM/i, 'security boundary must not overclaim browser isolation');
assert.equal(packageJson.scripts.lint, 'tsc --noEmit && node tests/security-static.test.mjs');
console.log('release security contract: ok');
