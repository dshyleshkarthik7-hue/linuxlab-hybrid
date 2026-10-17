import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('public', { recursive: true });
for (const name of ['home.css', 'v86-layout.css', '404.html']) {
  await copyFile(name, 'public/' + name);
}
console.log('[LinuxLab] Synced generated public compatibility assets from canonical root sources.');
