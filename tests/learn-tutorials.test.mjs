import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const pages = ['learn/index.html','learn/linux-basics/index.html','learn/terminal-navigation/index.html','learn/files-and-directories/index.html','learn/text-processing/index.html','learn/permissions/index.html','learn/processes/index.html','learn/shell-scripting/index.html','learn/operating-systems/index.html','learn/networking-basics/index.html'];
const htmlByPage = await Promise.all(pages.map(async page => [page, await readFile(resolve(root, page), 'utf8')]));
for (const [page, html] of htmlByPage) {
  assert.match(html, /<title>[^<]+<\/title>/i, `${page} needs a title`);
  assert.match(html, /<meta name="description" content="[^"]+">/i, `${page} needs a meta description`);
  assert.match(html, /<link rel="canonical" href="https:\/\/linuxterminal\.me\/learn\//i, `${page} needs a canonical URL`);
  assert.match(html, /<link rel="stylesheet" href="\/learn\/tutorials\.css">/i, `${page} must use shared external CSS`);
  assert.doesNotMatch(html, /<script(?![^>]+\bsrc=)[^>]*>/i, `${page} must not contain inline scripts`);
  assert.match(html, /<h1>[^<]+<\/h1>/i, `${page} needs a visible lesson heading`);
  assert.match(html, /<section class="lesson">/i, `${page} needs structured lesson content`);
  assert.match(html, /<pre>/i, `${page} needs a practical command/example block`);
  assert.match(html, /class="actions"/i, `${page} needs a practice/navigation action area`);
  assert.match(html, /<a href="\/learn\/[^\"]+\/">(?:Next|← Back|Previous)/i, `${page} needs progression navigation`);
  assert.match(html, /<a class="brand" href="\/">/i, `${page} needs consistent home navigation`);
}
const css = await readFile(resolve(root, 'learn/tutorials.css'), 'utf8');
assert.match(css, /\.grid\{/);
assert.match(css, /@media/);
assert.match(css, /prefers-reduced-motion/i, 'Tutorial CSS must respect reduced-motion preferences');
const index = htmlByPage.find(([page]) => page === 'learn/index.html')[1];
for (const route of ['/learn/operating-systems/', '/learn/networking-basics/']) assert.ok(index.includes(`href="${route}"`), `Tutorial index missing ${route}`);
console.log(`Tutorial content contract passed (${pages.length} pages)`);
