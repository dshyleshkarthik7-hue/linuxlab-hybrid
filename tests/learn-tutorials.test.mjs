import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const pages = ['learn/index.html','learn/linux-basics/index.html','learn/terminal-navigation/index.html','learn/files-and-directories/index.html','learn/text-processing/index.html','learn/permissions/index.html','learn/processes/index.html','learn/shell-scripting/index.html'];
const htmlByPage = await Promise.all(pages.map(async page => [page, await readFile(resolve(root, page), 'utf8')]));
for (const [page, html] of htmlByPage) {
  assert.match(html, /<title>[^<]+<\/title>/i, `${page} needs a title`);
  assert.match(html, /<meta name="description" content="[^"]+">/i, `${page} needs a meta description`);
  assert.match(html, /<link rel="canonical" href="https:\/\/linuxterminal\.me\/learn\//i, `${page} needs a canonical URL`);
  assert.match(html, /<link rel="stylesheet" href="\/learn\/tutorials\.css">/i, `${page} must use shared external CSS`);
  assert.doesNotMatch(html, /<script(?![^>]+\bsrc=)[^>]*>/i, `${page} must not contain inline scripts`);
}
const css = await readFile(resolve(root, 'learn/tutorials.css'), 'utf8');
assert.match(css, /\.grid\{/);
assert.match(css, /@media/);
console.log(`Tutorial content contract passed (${pages.length} pages)`);
