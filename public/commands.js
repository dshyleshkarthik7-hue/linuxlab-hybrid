const list = document.querySelector('#list');
const search = document.querySelector('#search');
const category = document.querySelector('#category');
const count = document.querySelector('#count');

// Keep the canonical 6,161-record dataset searchable without creating thousands
// of DOM nodes at once. More cards are appended only after explicit user action.
const PAGE_SIZE = 100;
let visibleLimit = PAGE_SIZE;
let filteredCommands = [];
let loadMoreButton;

async function loadCommands() {
  const response = await fetch('/command-index.json', { credentials: 'omit' });
  if (!response.ok) throw new Error('Command index unavailable');
  const payload = await response.json();
  if (!Array.isArray(payload.records) || !Number.isInteger(payload.recordCount) ||
      payload.recordCount < 6000 || payload.recordCount !== payload.records.length) {
    throw new Error('Canonical command index is incomplete');
  }
  return payload.records;
}

function createCard(item) {
  const card = document.createElement('article');
  card.className = 'card command-card';
  const pill = document.createElement('span');
  pill.className = 'pill';
  pill.textContent = item.category.toUpperCase();
  const title = document.createElement('h2');
  const code = document.createElement('code');
  code.textContent = item.name;
  title.appendChild(code);
  const desc = document.createElement('p');
  desc.className = 'muted';
  desc.textContent = item.summary;
  const link = document.createElement('a');
  link.className = 'cta';
  link.href = item.url;
  link.textContent = 'Open command page →';
  card.append(pill, title, desc, link);
  return card;
}

loadCommands().then((commands) => {
  if (search) search.value = new URLSearchParams(window.location.search).get('q') || '';
  for (const value of [...new Set(commands.map((item) => item.category))].sort()) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value[0].toUpperCase() + value.slice(1);
    category?.appendChild(option);
  }

  if (list) {
    loadMoreButton = document.createElement('button');
    loadMoreButton.type = 'button';
    loadMoreButton.className = 'cta';
    loadMoreButton.textContent = 'Load 100 more commands';
    loadMoreButton.setAttribute('aria-controls', 'list');
    loadMoreButton.hidden = true;
    list.insertAdjacentElement('afterend', loadMoreButton);
    loadMoreButton.addEventListener('click', () => {
      visibleLimit += PAGE_SIZE;
      render();
    });
  }

  function render() {
    if (!list) return;
    const q = (search?.value || '').toLowerCase().trim();
    const selected = category?.value || '';
    filteredCommands = commands.filter((item) =>
      (!q || item.name.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q)) &&
      (!selected || item.category === selected)
    );
    visibleLimit = Math.max(PAGE_SIZE, visibleLimit);
    list.replaceChildren(...filteredCommands.slice(0, visibleLimit).map(createCard));
    const shown = Math.min(visibleLimit, filteredCommands.length);
    if (count) count.textContent = 'Showing ' + shown + ' of ' + filteredCommands.length +
      ' matching commands (' + commands.length + ' total)';
    if (loadMoreButton) {
      const remaining = filteredCommands.length - shown;
      loadMoreButton.hidden = remaining <= 0;
      loadMoreButton.textContent = remaining > 0
        ? 'Load ' + Math.min(PAGE_SIZE, remaining) + ' more commands (' + remaining + ' remaining)'
        : '';
    }
  }

  function resetAndRender() {
    visibleLimit = PAGE_SIZE;
    render();
  }
  search?.addEventListener('input', resetAndRender);
  category?.addEventListener('change', resetAndRender);
  render();
}).catch((error) => {
  if (count) count.textContent = 'Command reference temporarily unavailable';
  console.error(error);
});
