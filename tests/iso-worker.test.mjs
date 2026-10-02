import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../cloudflare/iso-worker.ts', import.meta.url), 'utf8');
const config = await readFile(new URL('../cloudflare/wrangler.jsonc', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../artifacts/manifest.json', import.meta.url), 'utf8'));

assert.match(worker, /chunkStart/);
assert.match(worker, /chunkEnd/);
assert.match(worker, /MAX_CHUNK_BYTES\\s*=\\s*32\\s*\\*\\s*1024\\s*\\*\\s*1024/);
assert.match(worker, /const range\\s*=\\s*\\`bytes=\\$\\{chunk.start\\}-\\$\\{chunk.end\\}\\`/);
assert.match(worker, /Range:\\s*range/);
assert.match(worker, /requestedEnd >= size/);
assert.match(worker, /Conflicting range parameters/);
assert.match(worker, /status: 200/);
assert.match(worker, /upstream\\.status === 206/);
assert.doesNotMatch(worker, /"Cache-Control":\\s*"no-store"/);
assert.doesNotMatch(worker, /"CDN-Cache-Control":\\s*"no-store"/);
assert.doesNotMatch(worker, /cache:\\s*"no-store"/);
assert.match(worker, /WORKER_PROTOCOL_VERSION\\s*=\\s*"7"/);
assert.match(worker, /X-LinuxLab-SHA256/);
assert.match(worker, /X-LinuxLab-Chunk-Total/);
assert.match(worker, /cacheKey\\(request, originKey\\)/);
assert.match(worker, /await cache\\.match\\(key\\)/);
assert.match(worker, /ctx\\.waitUntil\\(cache\\.put\\(key, cacheable\\)\\)/);
assert.match(worker, /developer\\|virt\\|linux4/);
assert.match(worker, /a-f0-9/);
assert.match(worker, /manifest\\.json/);
assert(manifest.artifacts.some((artifact) => artifact.fallbackUrls?.some((url) => url.startsWith('https://huggingface.co/buckets/'))));
assert.match(worker, /ISO_RATE_LIMITER/);
assert.match(worker, /if \\(!isAllowedOrigin\\(origin\\)\\)/);
assert.match(config, /"cache"\\s*:\\s*\\{\\s*"enabled"\\s*:\\s*true/);
assert.match(config, /compatibility_date/);
assert.match(config, /observability/);

console.log('Cloudflare ISO worker contract passed');
