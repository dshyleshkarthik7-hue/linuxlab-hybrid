import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'dist');
assert.ok(existsSync(root), 'dist/ must exist before deployment output verification');

const commands = ['pwd','ls','cd','mkdir','cat','cp','mv','rm','grep','find','sed','awk','chmod','chown','ps','top','df','du','tar','curl','ssh','ip','ping','git','head','tail'];
for (const command of commands) {
  const file = join(root, 'commands', `${command}.html`);
  assert.ok(existsSync(file), `Built dist is missing /commands/${command}.html`);
  const page = readFileSync(file, 'utf8');
  assert.match(page, new RegExp(`rel=\\"canonical\\" href=\\"https://linuxterminal\\.me/commands/${command}\\.html\\"`), `Built canonical is wrong: ${command}`);
}

for (const file of ['commands-entry.html','commands.css','commands.js','beginner/index.html']) {
  assert.ok(existsSync(join(root, file)), `Built dist is missing ${file}`);
}
const catalog = readFileSync(join(root, 'commands.js'), 'utf8');
assert.equal([...catalog.matchAll(/\['[^']+','[^']+'\]/g)].length, 200, 'Built command catalogue must contain exactly 200 entries');
const beginner = readFileSync(join(root, 'beginner/index.html'), 'utf8');
assert.match(beginner, /200 Linux Commands/i, 'Built beginner page must retain the 200-command catalogue');
console.log(`dist routes: ${commands.length} dedicated command lessons + 200-command catalogue + beginner homepage verified`);
