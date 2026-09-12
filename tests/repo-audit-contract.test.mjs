import { strict as assert } from 'node:assert';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';

const builder = await readFile('iso-builder/build-linuxlab-gcc.sh', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

assert.doesNotMatch(builder, /--rbind\s+\/sys|--rbind\s+\/dev|--rbind\s+\/run/);
assert.match(builder, /sha256sum/);
assert.match(builder, /mount\s+-t\s+proc/);
assert.match(builder, /mount\s+-t\s+tmpfs/);
assert.equal(typeof packageJson.scripts['test:real-guest'], 'string');
assert.equal(typeof packageJson.scripts['test:repo-contract'], 'string');

for (const path of ['about/index.html','challenges/index.html','commands/index.html','contact/index.html','quiz/index.html','open-source-iso/index.html']) {
  await access(path, constants.F_OK);
}

for (const path of ['public/developer.html','public/session.js','public/linux-cd-command/index.html','public/linux-ls-command/index.html','robots.txt','sitemap.xml','public/_headers']) {
  await assert.rejects(access(path, constants.F_OK), undefined, `${path} must be removed`);
}

const commands = await readFile('commands/index.html', 'utf8');
assert.match(commands, /200 Linux command pages/);
assert.match(commands, /commands-index\.js/);
assert.doesNotMatch(commands, /\/commands\/(?:date|clear|man|nano|vim|vi)\//);

const headers = await readFile('netlify.toml', 'utf8');
assert.match(headers, /Strict-Transport-Security/);

console.log('Repository audit contract passed');
