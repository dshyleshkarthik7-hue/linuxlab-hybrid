import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('artifacts/manifest.json', 'utf8'));
assert.equal(manifest.schemaVersion, 2);
assert.ok(Array.isArray(manifest.artifacts) && manifest.artifacts.length >= 5);
for (const artifact of manifest.artifacts) {
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/i);
  assert.ok(Number.isSafeInteger(artifact.size) && artifact.size > 0);
  assert.match(artifact.release, /^[A-Za-z0-9._-]+$/);
  assert.match(artifact.url, /^https:\/\//);
  assert.match(artifact.releaseManifestUrl, /^https:\/\//);
}
const source = readFileSync('src/core/artifacts.ts', 'utf8');
const worker = readFileSync('cloudflare/iso-worker.ts', 'utf8');
const vite = readFileSync('vite.config.ts', 'utf8');
assert.match(source, /manifest\\.artifacts/);
assert.match(worker, /manifest\\.artifacts/);
assert.match(vite, /manifest\\.artifacts/);
assert.doesNotMatch(vite, /developer:\\s*['\"]/);
console.log('Artifact provenance manifest contract passed');
