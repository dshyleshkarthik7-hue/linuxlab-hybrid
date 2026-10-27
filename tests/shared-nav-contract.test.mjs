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
assert.match(injector, /homepage-runtime-contrast-guard/);
assert.match(injector, /new MutationObserver\(normalize\)/);
assert.match(injector, /getComputedStyle\(target\)\.getPropertyValue\(property\)/, 'contrast guard must compare computed colors, not CSS literal spellings');
assert.match(injector, /for \(const child of element\.querySelectorAll\('\*'\)\)/, 'contrast guard must normalize nested CTA labels');
assert.match(injector, /set\(child, 'background-color', 'transparent', 'rgba\(0, 0, 0, 0\)'\)/, 'nested labels must not paint a dark background over the button');
assert.match(injector, /heading\.style\.setProperty\('color', '#f1f7ff', 'important'\)/, 'comparison heading must be forced to the accessible foreground');
assert.match(injector, /attributeFilter: \['class'\]/, 'contrast observer must not observe style mutations that it creates');
assert.doesNotMatch(injector, /attributeFilter: \['class', 'style'\]/, 'contrast guard must not observe its own style writes');
assert.match(injector, /set\('background-color', secondary \? '#17466f' : '#075dcc', secondary \? 'rgb\(23, 70, 111\)' : 'rgb\(7, 93, 204\)'\)/);
assert.match(injector, /element\.style\.setProperty\(property, value, 'important'\)/);
assert.match(injector, /set\('background-image', 'none', 'none'\)/, 'background image guard must compare its computed value');
assert.match(injector, /set\('border-color', secondary \? '#83cfff' : '#72baff', secondary \? 'rgb\(131, 207, 255\)' : 'rgb\(114, 186, 255\)'\)/);
assert.match(pkg.scripts.build, /inject-shared-navigation\.mjs/);
assert.match(pkg.scripts['test:ci'], /test:shared-nav/);
console.log('Shared navigation contract passed');

assert.match(injector, /window\.addEventListener\('load', normalize/, 'homepage contrast guard must reassert after stylesheets and deferred scripts load');
assert.match(injector, /a\.btn\.secondary\[href\]\[href\]/, 'final injected contrast rules must outrank route-specific link selectors');
assert.ok(injector.includes("output.replace('</body>', contrastStyle + '</body>')"), 'final contrast stylesheet must follow all page stylesheets');

assert.doesNotMatch(injector, /accessible-cta-label/, 'build must not add nested CTA label wrappers that can regress contrast');
