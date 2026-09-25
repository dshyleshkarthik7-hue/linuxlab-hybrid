import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { assertTrustedArtifact, sha256Hex, sha256StreamHex, verifyArtifact, verifyResponse } from '../src/core/ISOIntegrity.ts';
import { DEVELOPER_ALPINE_ARTIFACT } from '../src/core/artifacts.ts';

const bytes = new TextEncoder().encode('linuxlab-integrity-fixture');
const digest = createHash('sha256').update(bytes).digest('hex');
const trusted = {
  version: 'test', architecture: 'x86', filename: 'fixture.iso',
  url: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/test/fixture.iso',
  releaseManifestUrl: 'https://api.github.com/repos/dshyleshkarthik7-hue/linuxlab-hybrid/releases/tags/test',
  sha256: digest, size: bytes.byteLength,
};

assert.doesNotThrow(() => assertTrustedArtifact(trusted));
assert.throws(() => assertTrustedArtifact({ ...trusted, sha256: '' }), /no trusted SHA-256/);
assert.throws(() => assertTrustedArtifact({ ...trusted, size: 0 }), /no trusted exact size/);
assert.throws(() => assertTrustedArtifact({ ...trusted, url: 'https://example.com/fixture.iso' }), /trusted release host/);
assert.throws(() => assertTrustedArtifact({ ...trusted, releaseManifestUrl: 'https://example.com/release' }), /untrusted release manifest/);
assert.equal(await verifyArtifact(bytes.buffer, trusted), true);
await assert.rejects(() => verifyArtifact(new Uint8Array(bytes.length + 1).buffer, trusted), /unexpected size/);
await assert.rejects(() => verifyArtifact(new TextEncoder().encode('wrong').buffer, { ...trusted, size: 5 }), /failed SHA-256/);

const fixture = new TextEncoder().encode('The quick brown fox jumps over the lazy dog');
const expected = createHash('sha256').update(fixture).digest('hex');
assert.equal(await sha256Hex(fixture.buffer), expected);
assert.equal(sha256StreamHex([fixture.subarray(0, 7), fixture.subarray(7, 19), fixture.subarray(19)]), expected);
assert.equal(sha256StreamHex([]), createHash('sha256').update('').digest('hex'));

const multiChunk = new Uint8Array(131_073);
for (let i = 0; i < multiChunk.length; i += 1) multiChunk[i] = i % 251;
const nodeDigest = createHash('sha256').update(multiChunk).digest('hex');
const chunks: Uint8Array[] = [];
for (let offset = 0; offset < multiChunk.length; offset += 4093) chunks.push(multiChunk.subarray(offset, Math.min(multiChunk.length, offset + 4093)));
assert.equal(sha256StreamHex(chunks), nodeDigest);

const response = new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.byteLength) } });
assert.deepEqual(new Uint8Array(await verifyResponse(response, trusted)), bytes);
await assert.rejects(() => verifyResponse(new Response(bytes, { status: 404 }), trusted), /download failed \(404\)/);
await assert.rejects(() => verifyResponse(new Response(bytes, { status: 200, headers: { 'content-length': '999' } }), trusted), /unexpected size metadata/);
await assert.rejects(() => verifyResponse(new Response(null, { status: 200 }), trusted), /no body/);
await assert.rejects(() => verifyResponse(new Response(new Uint8Array(bytes.length + 1), { status: 200 }), trusted), /unexpected size/);

if (process.env.ISO_LIVE_VERIFY === '1') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.ISO_LIVE_VERIFY_TIMEOUT_MS || 180_000));
  const token = process.env.GITHUB_TOKEN;
  const auth = token ? { Authorization: `Bearer ${token}` } : {};
  try {
    const manifestResponse = await fetch(DEVELOPER_ALPINE_ARTIFACT.releaseManifestUrl, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'LinuxTerminal-CI-ISO-Verify', ...auth }, signal: controller.signal });
    assert.equal(manifestResponse.ok, true, `Developer Alpine release manifest returned ${manifestResponse.status}`);
    const manifest = await manifestResponse.json() as { assets?: Array<{ name?: string; size?: number; digest?: string | null }> };
    const asset = manifest.assets?.find(candidate => candidate.name === DEVELOPER_ALPINE_ARTIFACT.filename);
    assert.ok(asset, 'Developer Alpine release asset is missing from the pinned release');
    assert.equal(asset.size, DEVELOPER_ALPINE_ARTIFACT.size);
    assert.equal(asset.digest?.toLowerCase().replace(/^sha256:/, ''), DEVELOPER_ALPINE_ARTIFACT.sha256.toLowerCase());
    const remote = await fetch(DEVELOPER_ALPINE_ARTIFACT.url, { headers: { Accept: 'application/octet-stream', 'User-Agent': 'LinuxTerminal-CI-ISO-Verify', ...auth }, redirect: 'follow', cache: 'no-store', signal: controller.signal });
    assert.equal(remote.ok, true, `Developer Alpine ISO returned ${remote.status}`);
    assert.ok(remote.body);
    const hash = createHash('sha256'); const reader = remote.body.getReader(); let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; hash.update(value); }
    assert.equal(size, DEVELOPER_ALPINE_ARTIFACT.size);
    assert.equal(hash.digest('hex'), DEVELOPER_ALPINE_ARTIFACT.sha256);
    console.log(`Developer Alpine release verified: ${size} bytes + SHA-256`);
  } finally { clearTimeout(timer); }
}
const verifiedIsoSource = require('node:fs').readFileSync('src/core/verified-iso-fetch.ts', 'utf8');
assert.match(verifiedIsoSource, /fetchIsoResumable\(candidate, artifact, controller\.signal\)/, 'ISO downloads must be cancellable when all callers leave');
console.log('ISO integrity fail-closed, response validation, and incremental hashing checks passed');
