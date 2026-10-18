const list = document.querySelector('#list');
const search = document.querySelector('#search');
const category = document.querySelector('#category');
const count = document.querySelector('#count');

// Progressive rendering for the 6,161-command catalogue.
const PAGE_SIZE = 50;
const PAGE_STEPS = [50, 100, 200, 500];
let visibleLimit = PAGE_SIZE;
let filteredCommands = [];
let loadMoreButton;
let pageSizeSelect;

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
  pill.textContent = String(item.category || 'command').toUpperCase();
  const title = document.createElement('h2');
  const code = document.createElement('code');
  code.textContent = item.name;
  title.appendChild(code);
  const desc = document.createElement('p');
  desc.className = 'muted';
  desc.textContent = item.summary || ('Open the full lesson for ' + item.name);
  const link = document.createElement('a');
  link.className = 'cta';
  link.href = item.url;
  link.textContent = 'Open full lesson →';
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

  if (list && !document.querySelector('#page-size')) {
    const toolbar = document.createElement('div');
    toolbar.className = 'catalog-toolbar';
    toolbar.style.cssText = 'display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;margin:0 0 1rem';
    const label = document.createElement('label');
    label.htmlFor = 'page-size';
    label.textContent = 'Show per page';
    pageSizeSelect = document.createElement('select');
    pageSizeSelect.id = 'page-size';
    pageSizeSelect.setAttribute('aria-label', 'Commands shown per page');
    for (const n of PAGE_STEPS) {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = String(n);
      if (n === PAGE_SIZE) opt.selected = true;
      pageSizeSelect.appendChild(opt);
    }
    pageSizeSelect.addEventListener('change', () => {
      visibleLimit = Number(pageSizeSelect.value) || PAGE_SIZE;
      render();
    });
    toolbar.append(label, pageSizeSelect);
    list.insertAdjacentElement('beforebegin', toolbar);
  }

  if (list) {
    loadMoreButton = document.createElement('button');
    loadMoreButton.type = 'button';
    loadMoreButton.className = 'cta';
    loadMoreButton.textContent = 'Load more commands';
    loadMoreButton.setAttribute('aria-controls', 'list');
    loadMoreButton.hidden = true;
    list.insertAdjacentElement('afterend', loadMoreButton);
    loadMoreButton.addEventListener('click', () => {
      const step = Number(pageSizeSelect?.value) || PAGE_SIZE;
      visibleLimit += step;
      render();
      loadMoreButton.focus();
    });
  }

  function filterCommands() {
    const q = (search?.value || '').trim().toLowerCase();
    const cat = category?.value || '';
    return commands.filter((item) => {
      if (cat && item.category !== cat) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q) ||
        String(item.summary || '').toLowerCase().includes(q) ||
        String(item.category || '').toLowerCase().includes(q);
    });
  }

  function render() {
    filteredCommands = filterCommands();
    const step = Number(pageSizeSelect?.value) || PAGE_SIZE;
    visibleLimit = Math.max(step, Math.min(visibleLimit, filteredCommands.length || step));
    const slice = filteredCommands.slice(0, visibleLimit);
    if (list) {
      list.replaceChildren();
      for (const item of slice) list.appendChild(createCard(item));
    }
    const shown = slice.length;
    const total = commands.length;
    const matched = filteredCommands.length;
    if (count) {
      if (matched === total) {
        count.textContent = 'Showing ' + shown + ' of ' + total + ' Linux commands. Use search or category filters to narrow results.';
      } else {
        count.textContent = 'Showing ' + shown + ' of ' + matched + ' matches (from ' + total + ' total). Refine search or load more.';
      }
    }
    if (loadMoreButton) {
      const remaining = matched - shown;
      loadMoreButton.hidden = remaining <= 0;
      loadMoreButton.textContent = remaining > 0
        ? 'Load ' + Math.min(step, remaining) + ' more (' + remaining + ' remaining)'
        : 'All matching commands shown';
    }
  }

  function resetAndRender() {
    visibleLimit = Number(pageSizeSelect?.value) || PAGE_SIZE;
    render();
  }

  search?.addEventListener('input', resetAndRender);
  category?.addEventListener('change', resetAndRender);
  render();
}).catch((error) => {
  if (count) count.textContent = 'Command reference temporarily unavailable. Refresh the page or try again shortly.';
  console.error(error);
});
