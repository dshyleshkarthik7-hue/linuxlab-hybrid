import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const nav = await readFile(new URL('../public/site-nav.js', import.meta.url), 'utf8');
const injector = await readFile(new URL('../scripts/inject-shared-navigation.mjs', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/site-nav.css', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
for (const [label, href] of [['Learn', '/learn/'], ['Commands', '/commands/'], ['Challenges', '/challenges/'], ['Quiz', '/quiz/'], ['Progress', '/progress/'], ['Careers', '/linux-careers/'], ['Certificate', '/certificate/'], ['Real Linux', '/real-linux/'], ['FAQ', '/faq/']]) {
  assert.ok(nav.includes(`['${label}', '${href}']`), `shared nav must include ${label}`);
}
assert.match(nav, /Skip to main content/);
assert.match(css, /focus-visible/);
assert.doesNotMatch(nav, /innerHTML/);
assert.match(injector, /dist/);
assert.match(injector, /site-nav\.js/);
assert.match(pkg.scripts.build, /inject-shared-navigation\.mjs/);
assert.match(pkg.scripts['test:ci'], /test:shared-nav/);
console.log('Shared navigation contract passed');
