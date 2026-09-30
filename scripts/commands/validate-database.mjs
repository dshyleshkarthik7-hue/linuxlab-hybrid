import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const dataPath = path.join(root, 'data/commands/index.json');
const database = JSON.parse(await readFile(dataPath, 'utf8'));
const records = database.records;
const fail = (message) => { throw new Error('[command-database] ' + message); };
if (database.schemaVersion !== 1) fail('unsupported schema version');
if (!Array.isArray(records) || records.length < 200) fail('database must contain at least the current 200 command records');
const ids = new Set(); const names = new Set(); const urls = new Set();
const distros = ['alpine','debian','ubuntu','lubuntu','kali'];
for (const command of records) {
  if (!/^linux\\.[a-z0-9][a-z0-9-]*$/.test(command.id)) fail('invalid id: ' + command.id);
  if (ids.has(command.id)) fail('duplicate id: ' + command.id); ids.add(command.id);
  if (names.has(command.name)) fail('duplicate command name: ' + command.name); names.add(command.name);
  if (urls.has(command.url)) fail('duplicate canonical URL: ' + command.url); urls.add(command.url);
  if (!command.summary || !command.example) fail('missing summary/example: ' + command.name);
  if (!['complete','planned'].includes(command.page?.status)) fail('invalid page status: ' + command.name);
  for (const distro of distros) if (!['available','not-default','unsupported','unverified'].includes(command.availability?.[distro])) fail('invalid '+distro+' availability: '+command.name);
}
const complete = records.filter((command) => command.page.status === 'complete');
if (complete.length !== 26) fail('expected 26 migrated dedicated lessons, found ' + complete.length);
if (new Set(complete.map((command) => command.name)).size !== 26) fail('migrated lesson names are not unique');
console.log('[command-database] validated ' + records.length + ' records; ' + complete.length + ' dedicated pages are migrated.');
