(() => {
  const links = [
    ['Learn', '/learn/'], ['Commands', '/commands/'], ['Challenges', '/challenges/'],
    ['Quiz', '/quiz/'], ['Progress', '/progress/'], ['Careers', '/linux-careers/'],
    ['Certificate', '/certificate/'], ['Real Linux', '/real-linux/'], ['FAQ', '/faq/']
  ];
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
