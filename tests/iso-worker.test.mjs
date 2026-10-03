import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../cloudflare/iso-worker.ts', import.meta.url), 'utf8');
const config = await readFile(new URL('../cloudflare/wrangler.jsonc', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../artifacts/manifest.json', import.meta.url), 'utf8'));

assert.match(worker, /chunkStart/);
assert.match(worker, /chunkEnd/);
assert.match(worker, /MAX_CHUNK_BYTES = 32 \* 1024 \* 1024/);
assert.match(worker, /const range = `bytes=\$\{chunk\.start\}-\$\{chunk\.end\}`/);
assert.match(worker, /Range: range/);
assert.match(worker, /requestedEnd >= size/);
assert.match(worker, /Conflicting range parameters/);
assert.match(worker, /status: 200/);
assert.match(worker, /status === 206/);
assert.match(worker, /upstream\.status === 200/);
assert.match(worker, /upstream\.status === 200 && image\.size <= MAX_FULL_UPSTREAM_BYTES/);
assert.match(worker, /MAX_FULL_UPSTREAM_BYTES = 64 \* 1024 \* 1024/);
assert.match(worker, /origins\.map\(async \(origin\) =>/);
assert.match(worker, /Promise\.any\(upstreamCandidates\)/);
assert.match(worker, /Fallbacks are raced concurrently/);
assert.doesNotMatch(worker, /Promise\.all\(origins\.map\(async \(origin\) =>/);
assert.match(worker, /fullBody\.slice\(chunk\.start, chunk\.end \+ 1\)/);
assert.doesNotMatch(worker, /"Cache-Control": "no-store"/);
assert.doesNotMatch(worker, /"CDN-Cache-Control": "no-store"/);
assert.doesNotMatch(worker, /cache: "no-store"/);
assert.match(worker, /WORKER_PROTOCOL_VERSION = "7"/);
assert.match(worker, /X-LinuxLab-SHA256/);
assert.match(worker, /X-LinuxLab-Chunk-Total/);
assert.match(worker, /headers\.set\("Content-Range", expectedContentRange\)/);
assert.match(worker, /cacheKey\(request, originKey, chunk\)/);
assert.match(worker, /url\.searchParams\.set\("chunkStart", String\(chunk\.start\)\)/);
assert.match(worker, /url\.searchParams\.set\("chunkEnd", String\(chunk\.end\)\)/);
assert.match(worker, /await cache\.match\(key\)/);
assert.match(worker, /ctx\.waitUntil\(cache\.put\(key, cacheable\)\)/);
const limiterIndex = worker.indexOf('await env.ISO_RATE_LIMITER.limit({ key: clientKey })');
const cacheIndex = worker.indexOf('const cached = await cache.match(key)');
assert.ok(limiterIndex >= 0 && cacheIndex >= 0 && limiterIndex < cacheIndex, 'ISO rate limiting must run before cache lookup');
assert.match(worker, /developer\|virt\|linux4/);
assert.match(worker, /a-f0-9/);
assert.match(worker, /manifest\.json/);
assert(manifest.artifacts.some((artifact) => artifact.fallbackUrls?.some((url) => url.startsWith('https://huggingface.co/buckets/'))));
assert.match(worker, /ISO_RATE_LIMITER/);
assert.match(worker, /if \(!isAllowedOrigin\(origin\)\)/);
assert.match(config, /"cache"\s*:\s*\{\s*"enabled"\s*:\s*true/);
assert.match(config, /compatibility_date/);
assert.match(config, /observability/);

console.log('Cloudflare ISO worker contract passed');

assert.match(worker, /invalid chunk metadata/);
assert.match(worker, /invalid artifact length/);

assert.match(worker, /endsWith\("\.huggingface\.co"\)/);
assert.match(worker, /endsWith\("\.xethub\.hf\.co"\)/);
assert.match(worker, /github-production-release-asset-/);
