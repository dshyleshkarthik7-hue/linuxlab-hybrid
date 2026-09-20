import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../cloudflare/iso-worker.ts', import.meta.url), 'utf8');
const config = await readFile(new URL('../cloudflare/wrangler.jsonc', import.meta.url), 'utf8');

assert.match(worker, /chunkStart/);
assert.match(worker, /chunkEnd/);
assert.match(worker, /MAX_CHUNK_BYTES\s*=\s*48\s*\*\s*1024\s*\*\s*1024/);
assert.match(worker, /const range\s*=\s*`bytes=\$\{chunk\.start\}-\$\{chunk\.end\}`/);
assert.match(worker, /Range:\s*range/);
assert.match(worker, /upstream\.status !== 206/);
assert.match(worker, /requestedEnd >= size/);
assert.match(worker, /chunkStart\/chunkEnd or a single HTTP Range header is required/);
assert.doesNotMatch(worker, /request\.headers\.get\("Range"\)/);
assert.match(worker, /return new Response\(request\.method === "HEAD" \? null : upstream\.body, \{\s*status: 200/);
assert.match(worker, /headers\.set\(\s*"Content-Range"/s);
assert.match(worker, /status:\s*200/);
assert.doesNotMatch(worker, /status:\s*206/);
assert.match(worker, /cacheable 200 object/);
assert.match(worker, /headers\.set\(\s*"Cache-Control",\s*"public, max-age=31536000, immutable"\s*\)/s);
assert.match(worker, /X-LinuxLab-Chunk-Total/);
assert.match(worker, /"Vary":\s*"Origin"/);
assert.doesNotMatch(worker, /headers\.set\(\s*"Content-Range"/);
assert.match(worker, /127\\\.0\\\.0\\\.1|localhost/);
assert.match(worker, /try \{\n\s*upstream = await fetch/);
assert.match(worker, /ISO origin unavailable/);
assert.doesNotMatch(worker, /arrayBuffer\(\)/);
assert.match(config, /"cache"\s*:\s*\{\s*"enabled"\s*:\s*true/);
assert.match(config, /linuxterminal\.me\/api\/iso\*/);

console.log('Cloudflare ISO worker contract passed');
