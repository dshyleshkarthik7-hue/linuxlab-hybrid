const list = document.querySelector('#list');
const search = document.querySelector('#search');
const category = document.querySelector('#category');
const count = document.querySelector('#count');

async function loadCommands() {
  const response = await fetch('/command-index.json', { credentials: 'omit' });
  if (!response.ok) throw new Error('Command index unavailable');
  const payload = await response.json();
  return Array.isArray(payload.records) ? payload.records : [];
}

loadCommands().then((commands) => {
  for (const value of [...new Set(commands.map((item) => item.category))].sort()) {
    const option = document.createElement('option'); option.value = value; option.textContent = value[0].toUpperCase() + value.slice(1); category?.appendChild(option);
  }
  function render() {
    if (!list) return;
    const q = (search?.value || '').toLowerCase().trim(); const selected = category?.value || '';
    const filtered = commands.filter((item) => (!q || item.name.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q)) && (!selected || item.category === selected));
    list.replaceChildren();
    for (const item of filtered) {
      const card = document.createElement('article'); card.className = 'card command-card';
      const pill = document.createElement('span'); pill.className = 'pill'; pill.textContent = item.category.toUpperCase();
      const title = document.createElement('h2'); const code = document.createElement('code'); code.textContent = item.name; title.appendChild(code);
      const desc = document.createElement('p'); desc.className = 'muted'; desc.textContent = item.summary;
      const link = document.createElement('a'); link.className = 'cta'; link.href = item.page.status === 'complete' ? item.url : '/beginner/#commands'; link.textContent = item.page.status === 'complete' ? 'Open command page →' : 'Reference entry →';
      card.append(pill, title, desc, link); list.appendChild(card);
    }
    if (count) count.textContent = filtered.length + ' of ' + commands.length + ' commands';
  }
  search?.addEventListener('input', render); category?.addEventListener('change', render); render();
}).catch((error) => { if (count) count.textContent = 'Command reference temporarily unavailable'; console.error(error); });
