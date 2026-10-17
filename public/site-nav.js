(() => {
  const links = [
    ['Learn', '/learn/'], ['Commands', '/commands/'], ['Challenges', '/challenges/'],
    ['Quiz', '/quiz/'], ['Progress', '/progress/'], ['Careers', '/linux-careers/'],
    ['Certificate', '/certificate/'], ['Real Linux', '/real-linux/'], ['FAQ', '/faq/']
  ];
  const style = document.createElement('style');
  style.textContent = '.site-shared-links{display:flex;flex-wrap:wrap;gap:.45rem .85rem;align-items:center;padding:.55rem .75rem;border-block:1px solid #38516d;background:#0b1726;color:#e6eef8;font:500 .9rem/1.5 system-ui,sans-serif}.site-shared-links a{color:inherit;text-decoration:underline;text-underline-offset:.2em}.site-shared-links a:focus-visible,.site-skip-link:focus-visible{outline:3px solid #7dd3fc;outline-offset:3px}.site-skip-link{position:absolute;z-index:9999;left:.75rem;top:-100px;background:#fff;color:#111;padding:.65rem 1rem;border-radius:.4rem}.site-skip-link:focus{top:.75rem}';
  document.head.append(style);
  const main = document.querySelector('main,[role="main"]');
  if (main && !main.id) main.id = 'main-content';
  if (main && !document.querySelector('.site-skip-link')) {
    const skip = document.createElement('a');
    skip.className = 'site-skip-link';
    skip.href = '#' + main.id;
    skip.textContent = 'Skip to main content';
    document.body.prepend(skip);
  }
  let nav = document.querySelector('nav[aria-label*="primary" i], nav.career-nav, header nav, main nav, nav');
  if (!nav) {
    nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Primary navigation');
    document.body.prepend(nav);
  }
  let container = nav.querySelector(':scope > .site-shared-links');
  if (!container) {
    container = document.createElement('div');
    container.className = 'site-shared-links';
    container.setAttribute('aria-label', 'Site links');
    nav.append(container);
  }
  const present = new Set([...nav.querySelectorAll('a[href]')].map((a) => {
    try { return new URL(a.getAttribute('href'), location.href).pathname.replace(/\/$/, '') || '/'; }
    catch { return ''; }
  }));
  for (const [label, href] of links) {
    if (present.has(href.replace(/\/$/, '') || '/')) continue;
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.textContent = label;
    container.append(anchor);
  }
})();
