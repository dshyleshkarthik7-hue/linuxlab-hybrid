import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile('public/commands.js', 'utf8');
const dedicatedMatch = source.match(/const DEDICATED_LESSONS = new Set\(\[([^\]]+)\]\)/s);
if (!dedicatedMatch) throw new Error('Unable to locate DEDICATED_LESSONS in public/commands.js');
const commands = [...dedicatedMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
if (!commands.length) throw new Error('Dedicated command lesson catalog is empty');
const lines = commands.map(command => `/commands/${command}/ /commands/${command}.html 301`);
await writeFile('public/_redirects', lines.join('\n') + '\n');
console.log(`[LinuxLab] Generated ${lines.length} command redirects from DEDICATED_LESSONS in the command catalog.`);
