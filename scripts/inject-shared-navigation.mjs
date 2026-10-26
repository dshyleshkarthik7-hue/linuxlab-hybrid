import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = 'dist';
const scriptTag = '<script defer src="/site-nav.js"></script>';
const styleTag = '<link rel="stylesheet" href="/site-nav.css">';
const runtimeContrastGuard = `<script id="homepage-runtime-contrast-guard">
(() => {
  const normalize = () => {
    if (location.pathname !== '/' && location.pathname !== '/index.html') return;
    for (const element of document.querySelectorAll('a.btn')) {
      const secondary = element.classList.contains('secondary');
      const set = (property, value) => {
        if (element.style.getPropertyValue(property) !== value ||
            element.style.getPropertyPriority(property) !== 'important') {
          element.style.setProperty(property, value, 'important');
        }
      };
      set('color', '#ffffff');
      set('-webkit-text-fill-color', '#ffffff');
      set('background-color', secondary ? '#17466f' : '#075dcc');
      set('background-image', 'none');
      set('border-color', secondary ? '#83cfff' : '#72baff');
    }
    for (const heading of document.querySelectorAll('.developer-guide .compare-grid h3')) {
      if (getComputedStyle(heading).color !== 'rgb(241, 247, 255)') {
        heading.style.setProperty('color', '#f1f7ff', 'important');
        heading.style.setProperty('-webkit-text-fill-color', '#f1f7ff', 'important');
      }
    }
  };
  normalize();
  const observer = new MutationObserver(normalize);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
  document.addEventListener('DOMContentLoaded', normalize, { once: true });
})();
</script>`;
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

/* Enforce contrast at the shared control level, not only for a fragile URL list.
   This final build-injected rule wins over route/theme declarations that can
   reintroduce dark text on dark cards. */
html body a.btn {
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
  background-color: #075dcc !important;
  background-image: none !important;
  border-color: #72baff !important;
}
html body a.btn.secondary {
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
  background-color: #17466f !important;
  background-image: none !important;
  border-color: #83cfff !important;
}
html body .comparison .compare-grid h3,
html body .developer-guide .compare-grid h3 {
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
      if (relative(root, path) === 'index.html' && !output.includes('homepage-runtime-contrast-guard') && output.includes('</body>')) {
        output = output.replace('</body>', runtimeContrastGuard + '</body>');
      }
      if (!output.includes('/site-nav.js') && output.includes('</body>')) output = output.replace('</body>', scriptTag + '</body>');
      if (output !== html) await writeFile(path, output);
    }
  }
}
await walk(root);
console.log('Injected shared navigation and skip-link enhancement into built HTML pages.');
