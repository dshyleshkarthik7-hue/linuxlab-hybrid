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
      // Compare computed values, not CSS source spellings (#fff vs #ffffff).
      // Otherwise MutationObserver can rewrite style on every notification forever.
      const set = (target, property, value, expectedComputed) => {
        if (getComputedStyle(target).getPropertyValue(property).trim().toLowerCase() !== expectedComputed) {
          target.style.setProperty(property, value, 'important');
        }
      };
      const foreground = 'rgb(255, 255, 255)';
      const background = secondary ? '#17466f' : '#075dcc';
      set(element, 'color', '#ffffff', foreground);
      set(element, '-webkit-text-fill-color', '#ffffff', foreground);
      set(element, 'background-color', background, secondary ? 'rgb(23, 70, 111)' : 'rgb(7, 93, 204)');
      set(element, 'background-image', 'none', 'none');
      set(element, 'border-color', secondary ? '#83cfff' : '#72baff', secondary ? 'rgb(131, 207, 255)' : 'rgb(114, 186, 255)');
      // Some page scripts add styled label spans inside CTAs. Inline !important
      // styles on those children outrank the stylesheet's a.btn * rules, so
      // enforce readable text and let the button's verified background show through.
      for (const child of element.querySelectorAll('*')) {
        set(child, 'color', '#ffffff', foreground);
        set(child, '-webkit-text-fill-color', '#ffffff', foreground);
        set(child, 'background-color', 'transparent', 'rgba(0, 0, 0, 0)');
        set(child, 'background-image', 'none', 'none');
      }
    }
    for (const heading of document.querySelectorAll('.developer-guide .compare-grid h3')) {
      // Apply inline important values unconditionally so later theme scripts
      // cannot leave this heading with a dark foreground on the dark card.
      heading.style.setProperty('color', '#f1f7ff', 'important');
      heading.style.setProperty('-webkit-text-fill-color', '#f1f7ff', 'important');
      heading.style.setProperty('background-color', 'transparent', 'important');
      heading.style.setProperty('background-image', 'none', 'important');
    }
  };
  normalize();
  const observer = new MutationObserver(normalize);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  document.addEventListener('DOMContentLoaded', normalize, { once: true });
  window.addEventListener('load', normalize, { once: true });
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
html body a.btn,
html body a.btn * {
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
  background-color: #075dcc !important;
  background-image: none !important;
  border-color: #72baff !important;
}
html body a.btn.secondary,
html body a.btn.secondary * {
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
  background-color: #17466f !important;
  background-image: none !important;
  border-color: #83cfff !important;
}
html body .comparison .compare-grid h3,
html body .comparison .compare-grid h3 *,
html body .developer-guide .compare-grid h3,
html body .developer-guide .compare-grid h3 * {
  color: #f1f7ff !important;
  -webkit-text-fill-color: #f1f7ff !important;
}

/* Final high-specificity rules are appended after all route stylesheets so
   contrast does not depend on the stylesheet order chosen by Vite. */
html body a.btn[href][href],
html body a.btn[href][href] *,
html body a.btn[href][href]:link,
html body a.btn[href][href]:visited,
html body a.btn[href][href]:hover,
html body a.btn[href][href]:focus-visible {
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
  background-color: #075dcc !important;
  background-image: none !important;
}
html body a.btn.secondary[href][href],
html body a.btn.secondary[href][href] *,
html body a.btn.secondary[href][href]:link,
html body a.btn.secondary[href][href]:visited,
html body a.btn.secondary[href][href]:hover,
html body a.btn.secondary[href][href]:focus-visible {
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
  background-color: #17466f !important;
  background-image: none !important;
}
html body .developer-guide > .compare-grid > div:first-child > h3 {
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
      // Match all anchor opening tags first, then inspect class attributes.
      // This avoids relying on a class-first attribute regex and makes the
      // build output itself authoritative for contrast, regardless of CSS order.
      output = output.replace(/<a\b[^>]*>/g, tag => {
        const classMatch = tag.match(/\bclass="([^"]*)"/);
        const classes = classMatch ? classMatch[1].split(/\s+/) : [];
        if (!classes.includes('btn')) return tag;
        const secondary = classes.includes('secondary');
        const background = secondary ? '#17466f' : '#075dcc';
        const border = secondary ? '#83cfff' : '#72baff';
        const style = `color:#fff!important;-webkit-text-fill-color:#fff!important;background:${background}!important;background-color:${background}!important;background-image:none!important;border:1px solid ${border}!important`;
        const withoutStyle = tag.replace(/\sstyle="[^"]*"/g, '');
        return withoutStyle.replace(/>$/, ` style="${style}">`);
      });
      if (relative(root, path) === 'index.html') {
        output = output.replace(
          /(<section class="info-card developer-guide">[\s\S]*?<div class="compare-grid">\s*<div>\s*<h3)(>)/,
          '$1 style="color:#f1f7ff!important;-webkit-text-fill-color:#f1f7ff!important"$2'
        );
      }
      if (!output.includes('/site-nav.css') && output.includes('</head>')) output = output.replace('</head>', styleTag + '</head>');
      if (!output.includes('site-accessible-control-colors') && output.includes('</body>')) output = output.replace('</body>', contrastStyle + '</body>');
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
