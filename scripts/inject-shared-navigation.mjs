import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = 'dist';
const scriptTag = '<script defer src="/site-nav.js"></script>';
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile() && entry.name.endsWith('.html')) {
      const html = await readFile(path, 'utf8');
      if (html.includes('/site-nav.js')) continue;
      if (!html.includes('</body>')) continue;
      await writeFile(path, html.replace('</body>', scriptTag + '</body>'));
    }
  }
}
await walk(root);
console.log('Injected shared navigation and skip-link enhancement into built HTML pages.');
