import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = 'https://linuxterminal.me';
const xml = await readFile('public/sitemap.xml', 'utf8');
const records = JSON.parse(await readFile('public/command-records.json', 'utf8')).records;
const intelligence = JSON.parse(await readFile('.cache/command-intelligence.json', 'utf8'));
const urls = [...xml.matchAll(/<loc>([^<]+)<\\/loc>/g)].map((match) => match[1]);
const urlSet = new Set(urls);

assert.equal(urlSet.size, urls.length, 'sitemap URLs must be unique');
assert.ok(urls.length >= 30, 'sitemap must include the required static routes');
assert.ok(urls.length < 6500, 'sitemap must not explode beyond catalogue + static routes');

const isIndexable = (record) => {
  if (record.page?.status === 'complete' && record.page?.source) return true;
  const lesson = intelligence.records?.[record.name] || record.intelligence || {};
  const reviewed = record.intelligence?.status === 'complete'
    || intelligence.records?.[record.name]?.status === 'complete';
  return Boolean(reviewed
    && String(lesson.definition || lesson.explanation || '').trim()
    && String(lesson.syntax || '').trim()
    && Array.isArray(lesson.examples)
    && lesson.examples.some((example) => typeof example === 'string' && example.trim())
    && Array.isArray(lesson.internals)
    && lesson.internals.length > 0);
};

let indexableCount = 0;
for (const record of records) {
  const path = record.url;
  assert.ok(typeof path === 'string' && path.startsWith('/commands/'), 'every catalogue record needs a canonical command URL: ' + record.name);
  const present = urlSet.has(base + path);
  const expected = isIndexable(record);
  if (expected) indexableCount += 1;
  assert.equal(present, expected, 'sitemap indexability mismatch for ' + record.name);
}
assert.ok(indexableCount < records.length, 'unreviewed command records must not be indexed as completed lessons');
console.log('Canonical sitemap indexability contract passed (' + urls.length + ' URLs; ' + indexableCount + ' indexable command lessons)');
