import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = 'dist';
const scriptTag = '<script defer src="/site-nav.js"></script>';
const styleTag = '<link rel="stylesheet" href="/site-nav.css">';
const contrastStyle = `<style id="site-accessible-control-colors">
/* Match the homepage's high-specificity inline guard; keep this override route-specific. */
html body .hero-actions > a.btn[href$="beginner/"],
html body .secondary.btn[href$="learn/"],
html body .secondary.btn[href$="certificate/"],
html body .level a.btn[href$="beginner/"],
html body a.btn[href$="real-linux/"],
html body .expert.level a.btn[href$="developer-alpine/"],
html body .level a.btn[href$="certificate/"] {
  color: #fff !important;
  -webkit-text-fill-color: #fff !important;
  background: #075dcc !important;
  background-color: #075dcc !important;
  border: 1px solid #72baff !important;
}
html body .secondary.btn[href$="learn/"],
html body .secondary.btn[href$="certificate/"] {
  background: #17466f !important;
  background-color: #17466f !important;
  border-color: #83cfff !important;
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
      // Normalize homepage CTA inline styles in the final build artifact. Earlier CSS-only
      // overrides can lose to stale inline !important declarations carried by generated HTML.
      if (relative(root, path) === 'index.html') {
        output = output.replace(/<a\b([^>]*\bclass="[^"]*\bbtn\b[^"]*"[^>]*)>/g, (tag, attributes) => {
          const classes = (attributes.match(/\bclass="([^"]*)"/) || [])[1] || '';
          const secondary = classes.split(/\s+/).includes('secondary');
          const background = secondary ? '#17466f' : '#075dcc';
          const border = secondary ? '#83cfff' : '#72baff';
          const style = `color:#fff!important;-webkit-text-fill-color:#fff!important;background:${background}!important;background-color:${background}!important;border:1px solid ${border}!important`;
          // Replace existing inline declarations instead of appending duplicate, potentially conflicting styles.
          if (!style.includes('color:#fff!important') || !style.includes('-webkit-text-fill-color:#fff!important')) {
            throw new Error('Homepage CTA normalization must pin both text-color mechanisms');
          }
          const cleaned = attributes.replace(/\sstyle="[^"]*"/g, '');
          return `<a${cleaned} style="${style}">`;
        });
        output = output.replace(
          /(<section class="info-card developer-guide">[\s\S]*?<div class="compare-grid">\s*<div>\s*<h3)(>)/,
          '$1 style="color:#f1f7ff!important;-webkit-text-fill-color:#f1f7ff!important"$2'
        );
      }
      if (!output.includes('/site-nav.css') && output.includes('</head>')) output = output.replace('</head>', styleTag + '</head>');
      if (!output.includes('site-accessible-control-colors') && output.includes('</head>')) output = output.replace('</head>', contrastStyle + '</head>');
      if (!output.includes('/site-nav.js') && output.includes('</body>')) output = output.replace('</body>', scriptTag + '</body>');
      if (output !== html) await writeFile(path, output);
    }
  }
}
await walk(root);
console.log('Injected shared navigation and skip-link enhancement into built HTML pages.');
