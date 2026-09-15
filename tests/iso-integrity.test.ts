import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { assertTrustedArtifact, verifyArtifact } from '../src/core/ISOIntegrity.ts';
import { DEVELOPER_ALPINE_ARTIFACT } from '../src/core/artifacts.ts';

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

async function verifyDeveloperRelease(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.ISO_LIVE_VERIFY_TIMEOUT_MS || 180_000));
  try {
    const manifestResponse = await fetch(DEVELOPER_ALPINE_ARTIFACT.releaseManifestUrl, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'LinuxTerminal-CI-ISO-Verify' },
      signal: controller.signal,
    });
    assert.equal(manifestResponse.ok, true, `Developer Alpine release manifest returned ${manifestResponse.status}`);
    const manifest = await manifestResponse.json() as { assets?: Array<{ name?: string; size?: number; digest?: string | null }> };
    const asset = manifest.assets?.find((candidate) => candidate.name === DEVELOPER_ALPINE_ARTIFACT.filename);
    assert.ok(asset, 'Developer Alpine release asset is missing from the v1.0.0 manifest');
    assert.equal(asset.size, DEVELOPER_ALPINE_ARTIFACT.size, 'Developer Alpine release size differs from the pinned artifact');
    assert.equal(
      asset.digest?.toLowerCase().replace(/^sha256:/, ''),
      DEVELOPER_ALPINE_ARTIFACT.sha256.toLowerCase(),
      'Developer Alpine release digest differs from the pinned artifact',
    );

    const response = await fetch(DEVELOPER_ALPINE_ARTIFACT.url, {
      headers: { Accept: 'application/octet-stream', 'User-Agent': 'LinuxTerminal-CI-ISO-Verify' },
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
    });
    assert.equal(response.ok, true, `Developer Alpine ISO returned ${response.status}`);
    assert.ok(response.body, 'Developer Alpine ISO response has no body');

    const hash = createHash('sha256');
    const reader = response.body.getReader();
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      hash.update(value);
    }
    assert.equal(size, DEVELOPER_ALPINE_ARTIFACT.size, `Developer Alpine downloaded ${size} bytes`);
    assert.equal(hash.digest('hex'), DEVELOPER_ALPINE_ARTIFACT.sha256, 'Developer Alpine SHA-256 verification failed');
    console.log(`Developer Alpine release verified: ${size} bytes + SHA-256`);
  } finally {
    clearTimeout(timer);
  }
}

if (process.env.ISO_LIVE_VERIFY === '1') await verifyDeveloperRelease();

console.log('ISO integrity fail-closed checks passed');
