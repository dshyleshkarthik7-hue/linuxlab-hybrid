import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const artifacts = await readFile('src/core/artifacts.ts', 'utf8');
const manifest = JSON.parse(await readFile('artifacts/manifest.json', 'utf8'));
const vm = await readFile('src/main-v86.ts', 'utf8');
const boundary = await readFile('docs/PRODUCTION_SECURITY_BOUNDARY.md', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

const requiredArtifacts = [
  ['ALPINE_ARTIFACT', 'alpine-virt-3.24.1-x86.iso'],
  ['DEVELOPER_ALPINE_ARTIFACT', 'alpine.iso'],
  ['LINUX4_ARTIFACT', 'linux4.iso'],
];

for (const [name, filename] of requiredArtifacts) {
  const declaration = artifacts.match(new RegExp(`export const ${name}\\s*=\\s*artifact\\('([^']+)'\\)`));
  assert.ok(declaration, `${name} must resolve through the canonical artifact manifest`);
  assert.equal(declaration[1], filename, `${name} must reference its expected manifest artifact`);

  const entry = manifest.artifacts.find((item) => item.filename === filename);
  assert.ok(entry, `${name} must have a manifest entry`);
  assert.match(entry.sha256, /^[0-9a-f]{64}$/i, `${name} must have a fixed SHA-256 digest in the manifest`);
  assert.ok(Number.isSafeInteger(entry.size) && entry.size > 0, `${name} must have a fixed positive size in the manifest`);
  assert.match(entry.url, /^https:\/\//, `${name} must have a pinned HTTPS artifact URL`);
  assert.match(entry.releaseManifestUrl, /^https:\/\//, `${name} must have a release manifest URL`);
}

assert.match(vm, /net_device:\s*\{\s*type:\s*'none'\s*\}/, 'v86 production profile must keep networking disabled');
assert.match(vm, /fetchVerifiedIso\(/, 'v86 must verify the complete ISO before boot');
assert.match(boundary, /not equivalent to a server-side microVM/i, 'security boundary must not overclaim browser isolation');
assert.equal(packageJson.scripts.lint, 'tsc --noEmit && node tests/security-static.test.mjs');
console.log('release security contract: ok');
