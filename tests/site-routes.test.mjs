import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const required = ['index.html','404.html','beginner/index.html','learn/index.html','learn/learn.css','learn/learn.js','progress/index.html','progress/progress.css','progress/progress.js','progress.js','challenges/index.html','challenges/challenges.js','quiz/index.html','certificate/index.html'];
for (const file of required) assert.ok(existsSync(join(root, file)), `Missing production route asset: ${file}`);
const html = readFileSync(join(root, 'index.html'), 'utf8');
for (const route of ['/beginner/','/learn/','/challenges/','/quiz/','/progress/','/certificate/']) assert.ok(html.includes(`href=\"${route}\"`), `Homepage missing route: ${route}`);
const beginner = readFileSync(join(root, 'beginner/index.html'), 'utf8');
for (const marker of ['200 Commands','id=\"commands\"','id=\"command-catalog-body\"']) assert.ok(beginner.includes(marker), `Beginner page lost 200-command catalogue marker: ${marker}`);
const learn = readFileSync(join(root, 'learn/index.html'), 'utf8');
assert.ok(learn.includes('/learn/learn.css') && learn.includes('/progress.js'), 'Tutorial assets missing');
const challenges = readFileSync(join(root, 'challenges/index.html'), 'utf8');
assert.ok(challenges.includes('/challenges/challenges.js') && challenges.includes('/challenges/challenges.css'), 'Challenge assets missing');
const progress = readFileSync(join(root, 'progress/index.html'), 'utf8');
assert.ok(progress.includes('/progress/progress.css') && progress.includes('/progress.js'), 'Progress assets missing');

const commands = ['pwd','ls','cd','mkdir','cat','cp','mv','rm','grep','find','sed','awk','chmod','chown','ps','top','df','du','tar','curl','ssh','ip','ping','git','head','tail'];
assert.equal(commands.length, 26);
const commandCatalogJs = readFileSync(join(root, 'public/commands.js'), 'utf8');
assert.equal([...commandCatalogJs.matchAll(/\['[^']+','[^']+'\]/g)].length, 200, 'Public command catalogue must contain exactly 200 entries');
const sitemap = readFileSync(join(root, 'public/sitemap.xml'), 'utf8');
for (const command of commands) {
  const file = `public/commands/${command}.html`;
  assert.ok(existsSync(join(root, file)), `Missing command page: ${file}`);
  const page = readFileSync(join(root, file), 'utf8');
  assert.ok(page.includes(`rel=\"canonical\" href=\"https://linuxterminal.me/commands/${command}.html\"`), `Bad canonical: ${command}`);
  assert.ok(page.includes('href=\"/commands.css\"'), 'Command CSS missing');
  assert.ok(page.includes('data-flow=\"play\"') && page.includes('data-flow=\"pause\"') && page.includes('data-flow=\"reset\"'), `Animation controls missing: ${command}`);
  assert.ok(sitemap.includes(`https://linuxterminal.me/commands/${command}.html`), `Sitemap missing ${command}`);
  assert.ok(!page.includes('id=\"app\"'), `Command page must not depend on client-rendered app shell: ${command}`);
}
const entry = readFileSync(join(root, 'commands-entry.html'), 'utf8');
assert.match(entry, /200 Linux Commands/i, 'Commands route must remain the 200-command catalogue');
assert.ok(entry.includes('id=\"list\"') && entry.includes('id=\"search\"') && entry.includes('id=\"category\"') && entry.includes('id=\"count\"'), 'Commands catalogue controls missing');
for (const command of commands) assert.ok(entry.includes(`/commands/${command}.html`), `Commands catalogue missing dedicated lesson ${command}`);
const netlify = readFileSync(join(root, 'netlify.toml'), 'utf8');
assert.ok(!netlify.includes('function = \"commands\"'), 'Legacy dynamic command edge route must not shadow static lessons');
assert.ok(netlify.includes('from = \"/commands\"') && netlify.includes('to = \"/commands-entry.html\"'), 'Canonical commands route missing');
for (const command of commands) {
  assert.ok(netlify.includes(`from = \"/commands/${command}/\"`) && netlify.includes(`to = \"/commands/${command}.html\"`), `Legacy redirect missing for ${command}`);
}
console.log(`site routes: ${required.length} core assets + 200-command catalogue + ${commands.length} static command lessons verified`);
