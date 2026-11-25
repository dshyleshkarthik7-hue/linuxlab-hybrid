import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('public', { recursive: true });
for (const name of ['home.css', 'v86-layout.css', '404.html']) {
  await copyFile(name, 'public/' + name);
}
await mkdir('public/challenges', { recursive: true });
await copyFile('challenges/challenges.js', 'public/challenges/challenges.js');
console.log('[LinuxLab] Synced generated public compatibility assets from canonical root sources.');
