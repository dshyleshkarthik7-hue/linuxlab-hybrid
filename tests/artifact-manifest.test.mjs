import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('artifacts/manifest.json', 'utf8'));
assert.equal(manifest.schemaVersion, 3);
assert.ok(Array.isArray(manifest.artifacts) && manifest.artifacts.length >= 5);

for (const artifact of manifest.artifacts) {
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/i);
  assert.ok(Number.isSafeInteger(artifact.size) && artifact.size > 0);
  assert.match(artifact.release, /^[A-Za-z0-9._-]+$/);
  assert.match(artifact.url, /^https:\/\//);
  if (artifact.fallbackUrls) for (const fallback of artifact.fallbackUrls) assert.match(fallback, /^https:\/\//);
  assert.match(artifact.releaseManifestUrl, /^https:\/\//);
}

const source = readFileSync('src/core/artifacts.ts', 'utf8');
const worker = readFileSync('cloudflare/iso-worker.ts', 'utf8');
const vite = readFileSync('vite.config.ts', 'utf8');

assert.match(source, /import manifest from ['"]\.\.\/\.\.\/artifacts\/manifest\.json['"]/);
assert.match(worker, /import manifest from ["']\.\.\/artifacts\/manifest\.json["']/);
assert.match(vite, /import manifest from ['"]\.\/artifacts\/manifest\.json['"]/);
assert.doesNotMatch(worker, /const IMAGES\s*=\s*\{/);
assert.doesNotMatch(vite, /testIsoSources\s*=\s*\{[^}]*developer/);
assert.doesNotMatch(source, /sha256:\s*['"][a-f0-9]{64}['"]/);

console.log('Artifact provenance manifest contract passed');

assert.equal(manifest.artifacts.find(item => item.filename === 'linux4.iso')?.image, 'linux4');
assert.match(readFileSync('index-v86.html', 'utf8'), /data-v86-profile="linux4"/);
