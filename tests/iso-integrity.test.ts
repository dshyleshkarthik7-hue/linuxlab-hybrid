import { strict as assert } from 'node:assert';
import { assertTrustedArtifact, verifyArtifact } from '../src/core/ISOIntegrity.ts';

const bytes = new TextEncoder().encode('linuxlab-integrity-fixture').buffer;
const trusted = { version: 'test', architecture: 'x86', filename: 'fixture.iso', url: '/fixture', releaseManifestUrl: '/manifest', sha256: 'f4e1fce0a4a4e3aee9c5f5c3dce6c6c8d3a2d3e4b1a1a7b0e7f3c1b9d6a6a7f5' };
await assert.rejects(() => verifyArtifact(bytes, trusted), /failed SHA-256/);
assert.throws(() => assertTrustedArtifact({ ...trusted, sha256: '' }), /no trusted SHA-256/);
console.log('ISO integrity fail-closed checks passed');
