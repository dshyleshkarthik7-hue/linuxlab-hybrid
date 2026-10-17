const root = document.querySelector('#live-jobs-feed');
if (root) {
  const status = root.querySelector('[data-jobs-status]');
  const list = root.querySelector('[data-jobs-list]');
  const formatDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  fetch('/api/careers-jobs', { headers: { accept: 'application/json' }, credentials: 'same-origin' })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Listings are temporarily unavailable.');
      return data;
    })
    .then((data) => {
      if (!Array.isArray(data.jobs) || !data.jobs.length) throw new Error('No current remote Linux listings were returned. Try the external job boards below.');
      for (const job of data.jobs) {
        const card = el('article', null, 'live-job-card');
        card.append(el('h3', job.title));
        card.append(el('p', job.company));
        const details = [job.location, job.category, job.jobType, job.salary, formatDate(job.publishedAt)].filter(Boolean);
        if (details.length) card.append(el('p', details.join(' · '), 'live-job-meta'));
        const link = el('a', 'View listing at Remotive ↗');
        link.href = job.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        card.append(link);
        list.append(card);
      }
      status.textContent = `Showing ${data.jobs.length} remote listings from Remotive. The feed is cached for up to 24 hours.`;
      root.setAttribute('aria-busy', 'false');
      const attribution = el('p', 'Source: Remotive. Listings may be delayed or change; verify eligibility and details at the source before applying.', 'live-job-attribution');
      const source = el('a', 'Remotive job board');
      source.href = data.sourceUrl || 'https://remotive.com/remote-jobs';
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      attribution.append(' ', source);
      root.append(attribution);
    })
    .catch((error) => {
      status.textContent = error instanceof Error ? error.message : 'Listings are temporarily unavailable.';
      status.classList.add('live-job-error');
      root.setAttribute('aria-busy', 'false');
    });
}
