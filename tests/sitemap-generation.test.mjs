import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const xml = await readFile('public/sitemap.xml', 'utf8');
const records = JSON.parse(await readFile('public/command-records.json', 'utf8')).records;
const intelligence = JSON.parse(await readFile('.cache/command-intelligence.json', 'utf8'));
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert.equal(new Set(urls).size, urls.length, 'sitemap URLs must be unique');
assert.ok(urls.length >= 6161, 'sitemap must include the full 6,161-command lesson catalogue');
assert.ok(urls.length < 6500, 'sitemap must not explode beyond catalogue + static routes');
for (const record of records) {
  const lesson = intelligence.records?.[record.name];
  const path = record.url || lesson?.url;
  if (!path) continue;
  const expected = record.page?.status === 'complete' || record.intelligence?.status === 'complete' || lesson?.status === 'complete' || Boolean(String(record.summary || '').trim() && String(record.example || '').trim());
  assert.equal(urls.includes('https://linuxterminal.me' + path), expected, 'sitemap indexability mismatch for ' + record.name);
}
console.log('Canonical sitemap indexability contract passed (' + urls.length + ' URLs)');
