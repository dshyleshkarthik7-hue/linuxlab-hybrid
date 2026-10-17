import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const edge = await readFile(new URL('../netlify/edge-functions/careers-jobs.ts', import.meta.url), 'utf8');
const config = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
const page = await readFile(new URL('../linux-careers.html', import.meta.url), 'utf8');
const client = await readFile(new URL('../careers-jobs.js', import.meta.url), 'utf8');

assert.match(config, /path = "\/api\/careers-jobs"[\s\S]*?function = "careers-jobs"/);
assert.match(edge, /https:\/\/remotive\.com\/api\/remote-jobs\?search=linux&limit=30/);
assert.match(edge, /s-maxage=\$\{CACHE_SECONDS\}/);
assert.match(edge, /stale-while-revalidate=86400/);
assert.match(edge, /stale-if-error=86400/);
assert.match(edge, /AbortSignal\.timeout\(8000\)/);
assert.match(edge, /parsed\.hostname !== 'remotive\.com'/);
assert.match(edge, /parsed\.pathname\.startsWith\('\/remote-jobs\/'\)/);
assert.match(edge, /source: 'Remotive'/);
assert.match(edge, /reserveDailyProviderRequest/);
assert.match(edge, /UPSTASH_REDIS_REST_TOKEN/);
assert.match(edge, /Number\(payload\.result\) <= 4/);
assert.match(edge, /s-maxage=\$\{CACHE_SECONDS\}/, 'feed responses must be cached at the CDN for 24 hours');
assert.match(page, /id="live-jobs-feed"/);
assert.match(page, /careers-jobs\.js/);
assert.match(client, /textContent = job\.title/);
assert.doesNotMatch(client, /innerHTML/);
console.log('Careers job-feed contract passed');
