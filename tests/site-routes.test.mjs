import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = process.cwd();
// Ensure build-time intelligence exists for Phase 2 route checks.
if (!existsSync(join(root, '.cache/command-intelligence.json'))) {
  for (const script of ['scripts/commands/build-database.mjs', 'scripts/commands/build-intelligence.mjs']) {
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(script + ' failed: ' + (result.stderr || result.stdout || ''));
  }
}
if (!existsSync(join(root, 'public/sitemap.xml'))) {
  const result = spawnSync(process.execPath, ['scripts/generate-sitemap.mjs'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('generate-sitemap failed: ' + (result.stderr || result.stdout || ''));
}

const required = ['index.html','404.html','beginner/index.html','learn/index.html','learn/learn.css','learn/learn.js','progress/index.html','progress/progress.css','progress/progress.js','challenges/index.html','challenges/challenges.js','quiz/index.html','certificate/index.html'];
for (const file of required) assert.ok(existsSync(join(root, file)), `Missing production route asset: ${file}`);
const html = readFileSync(join(root, 'index.html'), 'utf8');
for (const route of ['/beginner/','/learn/','/challenges/','/quiz/','/progress/','/certificate/']) assert.ok(html.includes(`href=\"${route}\"`), `Homepage missing route: ${route}`);
const beginner = readFileSync(join(root, 'beginner/index.html'), 'utf8');
for (const marker of ['200 Essential Linux Commands','id=\"commands\"','id=\"command-catalog-body\"']) assert.ok(beginner.includes(marker), `Beginner page lost 200-command catalogue marker: ${marker}`);
assert.match(beginner, /<title>Learn Linux Online — 200 Essential Commands/, 'Beginner metadata must describe the 200-command path');
assert.match(beginner, /href=\"\.\.\/commands\/\"/, 'Beginner page must link to the independent full catalog');
assert.match(beginner, /CURATED 200-COMMAND BEGINNER CURRICULUM/, 'Beginner catalog section must not be labelled as the full catalog');
assert.doesNotMatch(beginner, /href=\"#commands\">6,161 Commands/, 'Full-catalog navigation must not point to the 200-command section');
const learn = readFileSync(join(root, 'learn/index.html'), 'utf8');
assert.ok(learn.includes('/learn/learn.css') && learn.includes('/progress.js'), 'Tutorial assets missing');
const challenges = readFileSync(join(root, 'challenges/index.html'), 'utf8');
assert.ok(challenges.includes('/challenges/challenges.js') && challenges.includes('/challenges/challenges.css'), 'Challenge assets missing');
const progress = readFileSync(join(root, 'progress/index.html'), 'utf8');
assert.ok(/<link[^>]+href="(?:\.\/)?progress\.css"/.test(progress) && progress.includes('/progress.js'), 'Progress assets missing');
assert.deepEqual([...progress.matchAll(/<script[^>]+src="([^"]*progress\.js)"[^>]*>/g)].map((match) => match[1]), ['./progress.js'], 'Progress page must load exactly one page-local progress module');

const commands = ['pwd','ls','cd','mkdir','cat','cp','mv','rm','grep','find','sed','awk','chmod','chown','ps','top','df','du','tar','curl','ssh','ip','ping','git','head','tail'];
assert.equal(commands.length, 26);
const commandDatabase = JSON.parse(readFileSync(join(root, 'data/commands/index.json'), 'utf8'));
assert.equal(commandDatabase.records.length, 200, 'Phase 1 command database must preserve the current 200 command records');
assert.equal(new Set(commandDatabase.records.map((command) => command.name)).size, 200, 'Command database names must be unique');
assert.ok(commandDatabase.records.filter((command) => command.intelligence?.status === 'complete').length >= 26, 'Phase 2 must cover at least the 26 dedicated curated lessons');
const intelligenceIndex = JSON.parse(readFileSync(join(root, '.cache/command-intelligence.json'), 'utf8'));
assert.equal(Object.keys(intelligenceIndex.records).length, 6161, 'Intelligence index must cover all 6,161 canonical commands');
assert.equal(Object.values(intelligenceIndex.records).filter((r) => r.status === 'complete').length, 0, 'Unverified generated records must never be labeled complete');
assert.equal(Object.values(intelligenceIndex.records).filter((r) => r.status === 'draft').length, 6161, 'All 6,161 canonical commands must have explicit lesson records, with research status represented honestly');
// Intelligence is build-time only and lives outside the public web root.
assert.ok(existsSync(join(root, '.cache/command-intelligence.json')), 'Phase 2 intelligence index missing (.cache)');
assert.ok(existsSync(join(root, 'public/command-intelligence.js')), 'Phase 2 intelligence renderer missing');
assert.ok(existsSync(join(root, 'public/command-intelligence.css')), 'Phase 2 intelligence stylesheet missing');
assert.ok(existsSync(join(root, 'public/commands/custom/index.html')), 'Phase 3 custom command guide missing');
const canonicalCommands = JSON.parse(readFileSync(join(root, 'data/commands/canonical.json'), 'utf8'));
assert.equal(canonicalCommands.records.length, 6161, 'Canonical command catalogue must contain 6161 records');
assert.equal(new Set(canonicalCommands.records.map(({name}) => name.toLowerCase())).size, 6161, 'Canonical command names must be unique');
assert.ok(existsSync(join(root, 'public/commands.css')), 'Production command stylesheet is missing from public assets');
const sitemap = readFileSync(join(root, 'public/sitemap.xml'), 'utf8');
const expectedSitemapRoutes = ['/', '/beginner/', '/intermediate/', '/expert/', '/real-linux/', '/developer-alpine/', '/open-source-iso/', '/commands/', '/learn/', '/learn/linux-basics/', '/learn/terminal-navigation/', '/learn/files-and-directories/', '/learn/text-processing/', '/learn/permissions/', '/learn/processes/', '/learn/shell-scripting/', '/learn/operating-systems/', '/learn/networking-basics/', '/challenges/', '/quiz/', '/curriculum/', '/about/', '/contact/', '/certificate/', '/linux-careers/'];
for (const route of expectedSitemapRoutes) assert.ok(sitemap.includes(`https://linuxterminal.me${route}`), `Sitemap missing ${route}`);
for (const command of commands) {
  const file = `public/commands/${command}.html`;
  assert.ok(existsSync(join(root, file)), `Missing command page: ${file}`);
  const page = readFileSync(join(root, file), 'utf8');
  assert.ok(page.includes(`rel=\"canonical\" href=\"https://linuxterminal.me/commands/${command}.html\"`), `Bad canonical: ${command}`);
  assert.ok(/href="\\/commands\\.css(?:\\?v=\\d+)?"/.test(page), `Command CSS link missing or malformed: ${command}`);
  assert.ok(page.includes('data-flow=\"play\"') && page.includes('data-flow=\"pause\"') && page.includes('data-flow=\"reset\"'), `Animation controls missing: ${command}`);
  assert.ok(sitemap.includes(`https://linuxterminal.me/commands/${command}.html`), `Sitemap missing ${command}`);
  assert.ok(!page.includes('id=\"app\"'), `Command page must not depend on client-rendered app shell: ${command}`);
}
for (const command of commandDatabase.records.filter(({ page }) => page.status === 'complete')) {
  assert.equal(command.url, `/commands/${command.name}.html`, `Database canonical URL mismatch: ${command.name}`);
  assert.ok(existsSync(join(root, `public${command.url}`)), `Database points to missing command page: ${command.name}`);
}
const entry = readFileSync(join(root, 'commands-entry.html'), 'utf8');
assert.match(entry, /6,161 Linux Commands|6,161-command/i, 'Commands route must identify the current canonical command reference');
assert.match(entry, /complete 6,161-command reference independently of the beginner curriculum/i, 'Full catalog must be described independently');
assert.match(entry, /href=\"\/beginner\/\">Open the 200-command beginner path/, 'Catalog page must link to beginner learning as a separate path');
assert.doesNotMatch(entry, /href=\"\/beginner\/#commands\">Open the full beginner reference/, 'Full catalog CTA must not point to beginner commands');
assert.match(entry, /canonical 6,161-command catalog|complete catalogue/i, 'Commands route must describe the full canonical catalogue');
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
const vite = readFileSync('vite.config.ts', 'utf8');
for (const [route, input] of [['privacy/index.html', 'privacy: entry(\'privacy/index.html\')'], ['terms/index.html', 'terms: entry(\'terms/index.html\')'], ['faq/index.html', 'faq: entry(\'faq/index.html\')'], ['learn/library/index.html', 'learnLibrary: entry(\'learn/library/index.html\')']]) {
  assert.ok(vite.includes(input), `Vite production build input missing ${route}`);
}
console.log(`site routes: ${required.length} core assets + canonical command reference + ${commands.length} static command lessons verified`);
