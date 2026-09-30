import { readFile, writeFile } from 'node:fs/promises';

const source = JSON.parse(await readFile('data/commands/index.json', 'utf8'));
const commands = source.records.filter((record) => record.page?.status === 'complete');
if (!commands.length) throw new Error('Dedicated command lesson catalog is empty');

const lines = commands.flatMap((command) => {
  const name = encodeURIComponent(command.name);
  return [
    `/commands/${name}/ /commands/${name}.html 301`,
    `/commands/${name}.html /commands/${name}.html 200`,
  ];
});
await writeFile('public/_redirects', lines.join('\n') + '\n');
console.log(`[LinuxLab] Generated ${commands.length} canonical command redirects from data/commands/index.json.`);
