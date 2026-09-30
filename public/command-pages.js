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


function addPhase3TryPanel() {
  const commandName = document.querySelector('.command-intro h1')?.textContent?.trim();
  if (!commandName || !/^[A-Za-z0-9._+-]{1,64}$/.test(commandName)) return;
  const page = document.querySelector('.command-page');
  if (!page || page.querySelector('[data-phase3-try]')) return;
  const panel = document.createElement('section');
  panel.className = 'phase3-try';
  panel.dataset.phase3Try = '';
  panel.innerHTML = '<div><strong>Try this command</strong><p>Practice the exact command without leaving this lesson. Choose the lightweight simulator for instant practice or the real browser VM for actual Linux behavior.</p></div>';
  const actions = document.createElement('div'); actions.className = 'phase3-try-actions';
  const sim = document.createElement('a'); sim.className = 'cta'; sim.href = '/simulator/?try=' + encodeURIComponent(commandName); sim.textContent = 'Try in simulator →';
  const vm = document.createElement('a'); vm.className = 'cta'; vm.href = '/real-linux/?try=' + encodeURIComponent(commandName); vm.textContent = 'Try in real Linux VM →';
  actions.append(sim, vm); panel.append(actions); page.append(panel);
}
addPhase3TryPanel();
