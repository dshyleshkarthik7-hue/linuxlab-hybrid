const search = document.querySelector('#search');
const category = document.querySelector('#category');
const cards = [...document.querySelectorAll('.command-card')];
const count = document.querySelector('#count');

function filter() {
  const query = (search?.value || '').trim().toLowerCase();
  const selected = category?.value || '';
  let visible = 0;
  for (const card of cards) {
    const name = card.getAttribute('data-name') || '';
    const cardCategory = card.getAttribute('data-category') || '';
    const match = (!query || name.includes(query)) && (!selected || cardCategory === selected);
    card.hidden = !match;
    if (match) visible += 1;
  }
  if (count) count.textContent = `${visible} command${visible === 1 ? '' : 's'}`;
}

search?.addEventListener('input', filter);
category?.addEventListener('change', filter);
