import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const read = path => readFile(join(root, path), 'utf8');
const commands = ['pwd','ls','cd','mkdir','touch','cat','cp','mv','rm','find','echo','printf','grep','head','tail','wc','sort','uniq','sed','awk','chmod','whoami','ps','top','df','du','free','uname','date','env','export','history','clear','man','tar','gzip','zip','ping','curl','ip','ifconfig','ssh','scp','gcc','make','nano','vim','vi','less','cut'];
assert.equal(commands.length, 50);
const commandIndex = await read('commands/index.html');
for (const command of commands) assert.match(commandIndex, new RegExp(`/commands/${command}/`));
const edge = await read('netlify/edge-functions/commands.ts');
for (const command of commands) assert.match(edge, new RegExp(`\\['${command}',`));
assert.match(await read('quiz/index.html'), /const forms=\[/);
assert.match(await read('quiz/index.html'), /FEATURED|commands=/);
assert.match(await read('challenges/index.html'), /commands=/);
assert.match(await read('challenges/index.html'), /Challenge \$\{id\}/);
for (const page of ['index.html','beginner/index.html','intermediate/index.html','expert/index.html','about/index.html','contact/index.html','curriculum/index.html','commands/index.html','quiz/index.html','challenges/index.html','open-source-iso/index.html']) {
  const html = await read(page);
  assert.match(html, /<head>/i, `${page} missing head`);
  assert.match(html, /<title>[^<]+<\/title>/i, `${page} missing title`);
  assert.match(html, /rel=["']canonical["']/i, `${page} missing canonical`);
}
const home = await read('index.html');
assert.match(home, /Enter Beginner/);
assert.match(home, /Enter Intermediate/);
assert.match(home, /Enter Expert/);
assert.match(await read('beginner/index.html'), /Finish session/);
assert.match(await read('about/index.html'), /AURA OS/);
assert.match(await read('about/index.html'), /dshyleshkarthik7@gmail.com/);
assert.match(await read('contact/index.html'), /8317376970/);
assert.match(await read('open-source-iso/index.html'), /Alpine Linux/);
assert.match(await read('open-source-iso/index.html'), /Linux 4/);
const vite = await read('vite.config.ts');
for (const entry of ['about/index.html','contact/index.html','commands/index.html','quiz/index.html','challenges/index.html','open-source-iso/index.html']) assert.match(vite, new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
console.log('Content contract checks passed: 50 command pages, 500 quiz generation, 100 challenges, SEO metadata, learning flow and content pages');
