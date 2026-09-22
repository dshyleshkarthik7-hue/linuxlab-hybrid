import { readFileSync, existsSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const required = ['index.html','about/index.html','contact/index.html','curriculum/index.html','beginner/index.html','intermediate/index.html','expert/index.html','public/sitemap.xml','public/robots.txt'];
for (const file of required) assert.ok(existsSync(file), `missing ${file}`);
assert.equal(existsSync('sitemap.xml'), false, 'duplicate root sitemap must not be present');
assert.equal(existsSync('robots.txt'), false, 'duplicate root robots file must not be present');
for (const file of required.filter(f => f.endsWith('.html'))) {
  const html = readFileSync(file, 'utf8');
  assert.match(html, /<html[^>]+lang=/i, `${file}: missing lang`);
  assert.match(html, /<meta[^>]+name=["']viewport/i, `${file}: missing viewport`);
  assert.match(html, /<title>[^<]+<\/title>/i, `${file}: missing title`);
}
const generatedHeaders = readFileSync('scripts/generate-netlify-headers.mjs', 'utf8');
for (const header of ['Cross-Origin-Embedder-Policy','Strict-Transport-Security','Permissions-Policy']) assert.match(generatedHeaders, new RegExp(header));
const robots = readFileSync('public/robots.txt', 'utf8');
assert.match(robots, /Sitemap:/);
console.log('P2/P3 production contract checks passed');
