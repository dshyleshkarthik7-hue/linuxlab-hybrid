import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../cloudflare/iso-worker.ts', import.meta.url), 'utf8');
const config = await readFile(new URL('../cloudflare/wrangler.jsonc', import.meta.url), 'utf8');

assert.match(worker, /chunkStart/);
assert.match(worker, /chunkEnd/);
assert.match(worker, /getChunk\(url, image\.size, request\.headers\.get\("Range"\)\)/);
assert.match(worker, /MAX_CHUNK_BYTES\s*=\s*48\s*\*\s*1024\s*\*\s*1024/);
assert.match(worker, /const range\s*=\s*\`bytes=\$\{chunk\.start\}-\$\{chunk\.end\}\`/);
assert.match(worker, /Range:\s*range/);
assert.match(worker, /upstream\.status !== 206/);
assert.match(worker, /requestedEnd >= size/);
assert(worker.includes('const match = /^bytes=(\\d+)-(\\d*)$/.exec(rangeHeader || "");'));
assert.match(worker, /chunkStart\/chunkEnd or a single HTTP Range header is required/);
assert.match(worker, /request\.headers\.get\("Range"\)/);
assert.match(worker, /return new Response\(request\.method === "HEAD" \? null : upstream\.body, \{\s*status: 206/);
assert.match(worker, /headers\.set\(\s*"Content-Range"/s);
assert.match(worker, /status:\s*206/);
assert.match(worker, /manifest\.json/);
assert.match(worker, /isoEntries\.map/);
assert.match(worker, /X-LinuxLab-SHA256/);
assert.match(worker, /X-LinuxLab-Artifact-Size/);
assert.match(worker, /X-LinuxLab-Worker-Protocol/);
assert.match(worker, /WORKER_PROTOCOL_VERSION\s*=\s*"4"/);
assert.match(worker, /"Cache-Control":\s*"no-store"/);
assert.match(worker, /"CDN-Cache-Control":\s*"no-store"/);
assert.match(worker, /cache:\s*"no-store"/);
assert.match(worker, /X-LinuxLab-Chunk-Total/);
assert.match(worker, /"Vary":\s*"Origin"/);
assert(worker.includes('netlify\\.app'));
assert.match(worker, /new URL\(candidate\)\.origin !== url\.origin/);
assert.match(worker, /WORKER_PROTOCOL_VERSION\s*=\s*"4"/);
assert.doesNotMatch(worker, /const ALLOWED_ORIGINS = new Set/);

assert.match(worker, /try\s*\{\s*upstream\s*=\s*await\s+fetch/);
assert.match(worker, /ISO origin unavailable/);
assert.doesNotMatch(worker, /arrayBuffer\(\)/);
assert.match(config, /"cache"\s*:\s*\{\s*"enabled"\s*:\s*false/);
assert.match(config, /linuxterminal\.me\/api\/iso\*/);
assert.match(config, /compatibility_date/);
assert.match(config, /observability/);

console.log('Cloudflare ISO worker contract passed');
