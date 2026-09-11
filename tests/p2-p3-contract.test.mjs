import { readFileSync, existsSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const required = ['index.html','about/index.html','contact/index.html','curriculum/index.html','beginner/index.html','intermediate/index.html','expert/index.html','sitemap.xml','robots.txt','public/_headers'];
for (const file of required) assert.ok(existsSync(file), `missing ${file}`);
for (const file of required.filter(f => f.endsWith('.html'))) {
  const html = readFileSync(file, 'utf8');
  assert.match(html, /<html[^>]+lang=/i, `${file}: missing lang`);
  assert.match(html, /<meta[^>]+name=["']viewport/i, `${file}: missing viewport`);
  assert.match(html, /<title>[^<]+<\/title>/i, `${file}: missing title`);
}
const headers = readFileSync('public/_headers', 'utf8');
for (const header of ['X-Content-Type-Options','Referrer-Policy','Strict-Transport-Security','Permissions-Policy']) assert.match(headers, new RegExp(header));
const robots = readFileSync('robots.txt', 'utf8');
assert.match(robots, /Sitemap:/);
console.log('P2/P3 production contract checks passed');
