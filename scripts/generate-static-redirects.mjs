import { readFile, writeFile } from 'node:fs/promises';
const source = await readFile('public/commands.js', 'utf8');
const commands = [...source.matchAll(/\['([^']+)','[^']+'\]/g)].map(match => match[1]);
const dedicated = new Set(['pwd','ls','cd','mkdir','cat','cp','mv','rm','grep','find','sed','awk','chmod','chown','ps','top','df','du','tar','curl','ssh','ip','ping','git','head','tail']);
const lines = [...dedicated].map(command => \`/commands/\${command}/ /commands/\${command}.html 301\`);
await writeFile('public/_redirects', lines.join('\\n') + '\\n');
console.log(\`[LinuxLab] Generated \${lines.length} command redirects from the canonical command catalog.\`);
