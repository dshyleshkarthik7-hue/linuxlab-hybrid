import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.cwd();
const required = ['index.html','404.html','terms/index.html','privacy/index.html','verify/index.html','beginner/index.html','learn/index.html','learn/learn.css','learn/learn.js','progress/index.html','progress/progress.css','progress/progress.js','challenges/index.html','challenges/challenges.js','quiz/index.html','certificate/index.html'];
for (const file of required) assert.ok(existsSync(join(root, file)), `Missing production route asset: ${file}`);
const html = readFileSync(join(root, 'index.html'), 'utf8');
for (const route of ['/terms/','/privacy/','/verify/','/beginner/','/learn/','/challenges/','/quiz/','/progress/','/certificate/']) assert.ok(html.includes(`href=\"${route}\"`), `Homepage missing route: ${route}`);
const beginner = readFileSync(join(root, 'beginner/index.html'), 'utf8');
for (const marker of ['6,161 Commands','id=\"commands\"','id=\"command-catalog-body\"']) assert.ok(beginner.includes(marker), `Beginner page lost 6,161-command catalogue marker: ${marker}`);
const learn = readFileSync(join(root, 'learn/index.html'), 'utf8');
assert.ok(learn.includes('/learn/learn.css') && learn.includes('/progress.js'), 'Tutorial assets missing');
const challenges = readFileSync(join(root, 'challenges/index.html'), 'utf8');
assert.ok(challenges.includes('/challenges/challenges.js') && challenges.includes('/challenges/challenges.css'), 'Challenge assets missing');
const progress = readFileSync(join(root, 'progress/index.html'), 'utf8');
assert.ok(/<link[^>]+href="(?:\.\/)?progress\.css"/.test(progress) && progress.includes('/progress.js'), 'Progress assets missing');
assert.match(progress, /<script src="\/progress\.js" defer><\/script>\s*<script type="module" src="\.\/progress\.js"><\/script>/, 'Progress ledger must load before progress UI module');

const commands = ['pwd','ls','cd','mkdir','cat','cp','mv','rm','grep','find','sed','awk','chmod','chown','ps','top','df','du','tar','curl','ssh','ip','ping','git','head','tail'];
assert.equal(commands.length, 26);
const commandDatabase = JSON.parse(readFileSync(join(root, 'data/commands/index.json'), 'utf8'));
assert.equal(commandDatabase.records.length, 6161, 'Canonical command database must contain 6,161 records');
assert.equal(new Set(commandDatabase.records.map((command) => command.name)).size, 6161, 'Command database names must be unique');
assert.equal(commandDatabase.records.filter((command) => command.intelligence?.status === 'complete').length, 26, 'Phase 2 must cover all 26 dedicated lessons');
assert.ok(existsSync(join(root, 'public/command-intelligence.json')), 'Phase 2 intelligence index missing');
assert.ok(existsSync(join(root, 'public/command-intelligence.js')), 'Phase 2 intelligence renderer missing');
assert.ok(existsSync(join(root, 'public/command-intelligence.css')), 'Phase 2 intelligence stylesheet missing');
assert.ok(existsSync(join(root, 'public/commands/custom/index.html')), 'Phase 3 custom command guide missing');
const commandIndex = JSON.parse(readFileSync(join(root, 'public/command-index.json'), 'utf8'));
assert.deepEqual(commandIndex.records, commandDatabase.records.map(({ id, name, category, summary, example, url, page }) => ({ id, name, category, summary, example, url, page })), 'Generated command index must match the canonical database');
const sitemap = readFileSync(join(root, 'public/sitemap.xml'), 'utf8');
const expectedSitemapRoutes = ['/', '/beginner/', '/intermediate/', '/expert/', '/real-linux/', '/developer-alpine/', '/open-source-iso/', '/commands/', '/learn/', '/learn/linux-basics/', '/learn/terminal-navigation/', '/learn/files-and-directories/', '/learn/text-processing/', '/learn/permissions/', '/learn/processes/', '/learn/shell-scripting/', '/challenges/', '/quiz/', '/curriculum/', '/about/', '/contact/', '/certificate/', '/linux-careers/'];
for (const route of expectedSitemapRoutes) assert.ok(sitemap.includes(`https://linuxterminal.me${route}`), `Sitemap missing ${route}`);
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
for (const command of commandDatabase.records.filter(({ page }) => page.status === 'complete')) {
  assert.equal(command.url, `/commands/${command.name}.html`, `Database canonical URL mismatch: ${command.name}`);
  assert.ok(existsSync(join(root, `public${command.url}`)), `Database points to missing command page: ${command.name}`);
}
const entry = readFileSync(join(root, 'commands-entry.html'), 'utf8');
assert.match(entry, /6,161 Linux Commands/i, 'Commands route must remain the 6,161-command catalogue');
assert.ok(entry.includes('id=\"list\"') && entry.includes('id=\"search\"') && entry.includes('id=\"category\"') && entry.includes('id=\"count\"'), 'Commands catalogue controls missing');
for (const command of commands) assert.ok(entry.includes(`/commands/${command}.html`), `Commands catalogue missing dedicated lesson ${command}`);
const netlify = readFileSync(join(root, 'netlify.toml'), 'utf8');
assert.ok(!netlify.includes('function = \"commands\"'), 'Legacy dynamic command edge route must not shadow static lessons');
assert.ok(netlify.includes('from = \"/commands\"') && netlify.includes('to = \"/commands-entry.html\"'), 'Canonical commands route missing');
for (const command of commands) {
  const from = `from = \"/commands/${command}/\"`;
  const canonical = `to = \"/commands/${command}.html`;
  assert.ok(netlify.includes(from) && netlify.includes(canonical), `Legacy redirect missing for ${command}`);
}
console.log(`site routes: ${required.length} core assets + 6,161-command catalogue + ${commands.length} static command lessons verified`);
