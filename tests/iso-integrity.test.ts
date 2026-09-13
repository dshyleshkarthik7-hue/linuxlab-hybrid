import { strict as assert } from 'node:assert';
import { assertTrustedArtifact, verifyArtifact } from '../src/core/ISOIntegrity.ts';

const bytes = new TextEncoder().encode('linuxlab-integrity-fixture').buffer;
const trusted = {
  version: 'test',
  architecture: 'x86',
  filename: 'fixture.iso',
  url: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/test/fixture.iso',
  releaseManifestUrl: 'https://api.github.com/repos/dshyleshkarthik7-hue/linuxlab-hybrid/releases/tags/test',
  sha256: '0'.repeat(64),
  size: bytes.byteLength,
};

await assert.rejects(
  () => verifyArtifact(bytes, trusted),
  /failed SHA-256/
);

assert.throws(
  () => assertTrustedArtifact({ ...trusted, sha256: '' }),
  /no trusted SHA-256/
);

assert.throws(
  () => assertTrustedArtifact({ ...trusted, size: 0 }),
  /no trusted exact size/
);

console.log('ISO integrity fail-closed checks passed');
