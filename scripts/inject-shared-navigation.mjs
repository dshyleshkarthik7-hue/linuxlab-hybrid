import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = 'dist';
const scriptTag = '<script defer src="/site-nav.js"></script>';
const styleTag = '<link rel="stylesheet" href="/site-nav.css">';
const contrastStyle = `<style id="site-accessible-control-colors">
/* Scope the contrast override to the dark-themed homepage CTA components.
   Do not globally recolor .btn: other routes (for example careers) deliberately
   use a cyan button with dark text, and overriding only its text caused the
   reported 1.62:1 contrast failure. */
.hero-actions .btn, .level .btn {
  color: #fff !important;
  -webkit-text-fill-color: #fff !important;
  background: #005bb5 !important;
  background-color: #005bb5 !important;
  border-color: #72baff !important;
}
.developer-guide .compare-grid > div:nth-child(1) > h3 {
  color: #f1f7ff !important;
  -webkit-text-fill-color: #f1f7ff !important;
}
</style>`;
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile() && entry.name.endsWith('.html')) {
      const html = await readFile(path, 'utf8');
      let output = html;
      if (!output.includes('/site-nav.css') && output.includes('</head>')) output = output.replace('</head>', styleTag + '</head>');
      if (!output.includes('site-accessible-control-colors') && output.includes('</head>')) output = output.replace('</head>', contrastStyle + '</head>');
      if (!output.includes('/site-nav.js') && output.includes('</body>')) output = output.replace('</body>', scriptTag + '</body>');
      if (output !== html) await writeFile(path, output);
    }
  }
}
await walk(root);
console.log('Injected shared navigation and skip-link enhancement into built HTML pages.');
