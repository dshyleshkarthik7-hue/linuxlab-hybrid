const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
for (const card of document.querySelectorAll('.flow-card')) {
  const dot = card.querySelector('.flow-pulse');
  const play = card.querySelector('[data-flow="play"]');
  const pause = card.querySelector('[data-flow="pause"]');
  const reset = card.querySelector('[data-flow="reset"]');
  if (prefersReducedMotion) card.classList.add('is-paused');
  play?.addEventListener('click', () => {
    card.classList.remove('is-paused');
    card.classList.remove('is-reset');
  });
  pause?.addEventListener('click', () => card.classList.add('is-paused'));
  reset?.addEventListener('click', () => {
    card.classList.add('is-reset');
    card.classList.remove('is-paused');
    if (dot) { dot.getBoundingClientRect(); }
  });
}


const intelligenceMount = document.createElement('div');
const commandName = document.querySelector('.command-intro h1')?.textContent?.trim();
if (commandName) {
  intelligenceMount.dataset.commandIntelligence = '';
  intelligenceMount.dataset.command = commandName;
  document.querySelector('.command-page')?.appendChild(intelligenceMount);
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = '/command-intelligence.css';
  document.head.appendChild(link);
  const script = document.createElement('script');
  script.src = '/command-intelligence.js'; script.defer = true;
  document.body.appendChild(script);
}
