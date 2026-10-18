import { readFile, writeFile } from 'node:fs/promises';

const base = 'https://linuxterminal.me';
const staticPaths = [
  '/learn/operating-systems/', '/learn/networking-basics/', '/', '/beginner/', '/tutorials/', '/tutorials/linux-ls-command/', '/tutorials/grep-examples/',
  '/intermediate/', '/expert/', '/real-linux/', '/developer-alpine/',
  '/open-source-iso/', '/commands/', '/learn/', '/learn/linux-basics/',
  '/learn/terminal-navigation/', '/learn/files-and-directories/',
  '/learn/text-processing/', '/learn/permissions/', '/learn/processes/',
  '/learn/shell-scripting/', '/challenges/', '/quiz/', '/curriculum/',
  '/about/', '/contact/', '/certificate/', '/faq/', '/terms/',
  '/privacy/', '/verify/', '/learn/library/', '/linux-careers/'
];

const canonical = JSON.parse(await readFile('public/command-records.json', 'utf8'));
// Intelligence is intentionally generated outside the public web root (.cache).
const intelligence = JSON.parse(await readFile('.cache/command-intelligence.json', 'utf8'));
if (!Array.isArray(canonical.records)) throw new Error('Canonical command catalog is invalid');
const isIndexable = (record) => {
  if (record.page?.status === 'complete' && record.page?.source) return true;
  const lesson = intelligence.records?.[record.name] || record.intelligence || {};
  const reviewed = record.intelligence?.status === 'complete' || intelligence.records?.[record.name]?.status === 'complete';
  return Boolean(reviewed
    && String(lesson.definition || lesson.explanation || '').trim()
    && String(lesson.syntax || '').trim()
    && Array.isArray(lesson.examples) && lesson.examples.some((example) => typeof example === 'string' && example.trim())
    && Array.isArray(lesson.internals) && lesson.internals.length > 0);
};
const commandUrls = canonical.records
  .filter(isIndexable)
  .map((record) => {
    if (typeof record.url !== 'string' || !record.url.startsWith('/commands/')) {
      throw new Error('Indexable command has no canonical URL: ' + record.name);
    }
    return base + record.url;
  });
const urls = [...new Set([...staticPaths.map((path) => base + path), ...commandUrls])].sort((a, b) => {
  if (a === base + '/') return -1;
  if (b === base + '/') return 1;
  return a.localeCompare(b);
});
const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + urls.map((url) => '  <url><loc>' + url.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</loc></url>').join('\n')
  + '\n</urlset>\n';
const path = 'public/sitemap.xml';
if (process.argv.includes('--check')) {
  const current = await readFile(path, 'utf8');
  if (current !== xml) throw new Error('public/sitemap.xml is stale; run node scripts/generate-sitemap.mjs');
  process.stdout.write('Sitemap is current (' + urls.length + ' indexable URLs).\n');
} else {
  await writeFile(path, xml, 'utf8');
  process.stdout.write('Generated sitemap with ' + urls.length + ' indexable URLs.\n');
}
