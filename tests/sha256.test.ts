import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { Sha256 } from '../src/core/sha256.ts';

function digestNative(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function digestStreaming(chunks: Uint8Array[]): string {
  const hash = new Sha256();
  for (const chunk of chunks) hash.update(chunk);
  return hash.digestHex();
}

const empty = new Uint8Array();
assert.equal(digestStreaming([]), digestNative(empty));

const fixture = new TextEncoder().encode('The quick brown fox jumps over the lazy dog');
assert.equal(digestStreaming([fixture]), digestNative(fixture));
assert.equal(
  digestStreaming([fixture.subarray(0, 7), fixture.subarray(7, 19), fixture.subarray(19)]),
  digestNative(fixture),
);

const multiChunk = new Uint8Array(131_073);
for (let i = 0; i < multiChunk.length; i += 1) multiChunk[i] = i % 251;
const chunks: Uint8Array[] = [];
for (let offset = 0; offset < multiChunk.length; offset += 4093) {
  chunks.push(multiChunk.subarray(offset, Math.min(multiChunk.length, offset + 4093)));
}
assert.equal(digestStreaming(chunks), digestNative(multiChunk));

const finalized = new Sha256().update(fixture);
finalized.digest();
assert.throws(() => finalized.update(empty), /already finalized/);
assert.throws(() => finalized.digest(), /already finalized/);

console.log('incremental SHA-256 checks passed');
