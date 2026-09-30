import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const source = path.join(root, 'data/commands/index.json');
const output = path.join(root, 'public/command-index.json');
const database = JSON.parse(await readFile(source, 'utf8'));
const records = database.records;
const index = { schemaVersion: database.schemaVersion, generatedFrom: 'data/commands/index.json', records: records.map(({ id, name, category, summary, example, url, page, intelligence }) => ({ id, name, category, summary, example, url, page })) };
await writeFile(output, JSON.stringify(index, null, 2) + '\\n');
console.log('[command-database] generated public/command-index.json from the canonical database.');
