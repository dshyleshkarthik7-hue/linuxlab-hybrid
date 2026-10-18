import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('public/commands.js', 'utf8');
const html = await readFile('commands-entry.html', 'utf8');

assert.match(source, /const PAGE_SIZE = (50|100)/, 'Catalog DOM rendering must be bounded');
assert.match(source, /filteredCommands\.slice\(0, visibleLimit\)/, 'Only the visible page may be rendered');
assert.match(source, /loadMoreButton\.addEventListener\('click'/, 'Additional results must be user-triggered');
assert.match(source, /list\.replaceChildren\(\)/, 'Rerendering must clear stale nodes');
assert.match(source, /link\.href = item\.url/, 'Command links must use canonical catalog URLs');
assert.match(source, /code\.textContent = item\.name/, 'Command labels must be inserted as text, not HTML');
assert.match(source, /desc\.textContent = item\.summary/, 'Descriptions must be inserted as text, not HTML');
assert.match(source, /page-size|Show per page/, 'Catalog must expose a page-size control for UX clarity');
assert.match(html, /id="list"/, 'Catalog HTML must expose the list container');
assert.match(html, /id="count"/, 'Catalog HTML must expose a status counter');
console.log('command catalog pagination contract passed');
