import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const xml = await readFile('public/sitemap.xml', 'utf8');
const canonical = JSON.parse(await readFile('data/commands/canonical.json', 'utf8'));
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert.equal(new Set(urls).size, urls.length, 'sitemap URLs must be unique');
assert.ok(urls.length < 300, 'sitemap must not index catalog-only stubs');
for (const record of canonical.records) {
  const expected = record.page?.status === 'complete' || record.intelligence?.status === 'complete' || Boolean(String(record.summary || '').trim() && String(record.example || '').trim());
  assert.equal(urls.includes('https://linuxterminal.me' + record.url), expected, 'sitemap indexability mismatch for ' + record.name);
}
console.log('Canonical sitemap indexability contract passed');
