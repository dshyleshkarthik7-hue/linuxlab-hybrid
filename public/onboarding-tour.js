(() => {
  const KEY = 'linuxterminal.onboarding.dismissed.v1';
  try { if (localStorage.getItem(KEY) === '1') return; } catch { return; }
  if (document.querySelector('[data-learning-tour]')) return;
  const panel = document.createElement('aside');
  panel.className = 'learning-tour';
  panel.dataset.learningTour = 'true';
  panel.setAttribute('aria-labelledby', 'learning-tour-title');
  const heading = document.createElement('h2');
  heading.id = 'learning-tour-title';
  heading.textContent = 'A quick path through LinuxTerminal';
  const intro = document.createElement('p');
  intro.textContent = 'A short, optional tour. Your progress stays in this browser.';
  const list = document.createElement('ol');
  for (const [label, href, detail] of [
    ['Learn', '/learn/', 'Build the foundations'],
    ['Commands', '/commands/', 'Read command-specific lessons'],
    ['Challenges', '/challenges/', 'Practice and mark tasks complete'],
    ['Progress badges', '/progress/', 'Review and back up your local progress']
  ]) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = href; link.textContent = label;
    const note = document.createElement('span'); note.textContent = ' — ' + detail;
    item.append(link, note); list.append(item);
  }
  const dismiss = document.createElement('button');
  dismiss.type = 'button'; dismiss.textContent = 'Dismiss tour';
  dismiss.addEventListener('click', () => {
    try { localStorage.setItem(KEY, '1'); } catch {}
    panel.remove();
  });
  panel.append(heading, intro, list, dismiss);
  (document.querySelector('main') || document.body).append(panel);
})();
