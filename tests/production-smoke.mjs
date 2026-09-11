import { strict as assert } from 'node:assert';
const baseURL = process.env.PRODUCTION_BASE_URL || process.argv[2];
if (!baseURL) throw new Error('PRODUCTION_BASE_URL is required for post-deployment verification');
const origin = baseURL.replace(/\/$/, '');
for (const path of ['/index.html', '/simulator.html', '/index-v86.html', '/robots.txt', '/sitemap.xml']) {
  const response = await fetch(origin + path, { redirect: 'error' });
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
}
const page = await (await fetch(origin + '/index.html')).text();
assert.match(page, /LinuxTerminal|LinuxLab/i);
assert.doesNotMatch(page, /<script(?![^>]+src=)[^>]*>/i, 'production homepage must not contain inline scripts');
console.log('Production deployment smoke checks passed');
