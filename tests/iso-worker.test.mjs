import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../cloudflare/iso-worker.ts', import.meta.url), 'utf8');
const config = await readFile(new URL('../cloudflare/wrangler.jsonc', import.meta.url), 'utf8');

assert.match(worker, /chunkStart/);
assert.match(worker, /chunkEnd/);
assert.match(worker, /MAX_CHUNK_BYTES\s*=\s*48\s*\*\s*1024\s*\*\s*1024/);
assert.match(worker, /Range:\s*'bytes='/);
assert.match(worker, /upstream\.status !== 206/);
assert.match(worker, /status:\s*200/);
assert.match(worker, /Cache-Control.*immutable/);
assert.match(worker, /X-LinuxLab-Chunk-Total/);
assert.match(worker, /try \{\n\s*upstream = await fetch/);
assert.match(worker, /ISO origin unavailable/);
assert.doesNotMatch(worker, /arrayBuffer\(\)/);
assert.match(config, /"cache"\s*:\s*\{\s*"enabled"\s*:\s*true/);
assert.match(config, /linuxterminal\.me\/api\/iso\*/);

console.log('Cloudflare ISO worker contract passed');
