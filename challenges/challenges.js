(() => {
  const list = document.querySelector('#list');
  const search = document.querySelector('#challenge-search');
  const category = document.querySelector('#challenge-category');
  const count = document.querySelector('#completed-count');
  const clear = document.querySelector('#clear-progress');
  let done = window.LinuxProgress?.read().challenges.map(x => x.id) || [];
  let data = null;
  let visibleCount = 0;
  if (count) { count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite'); count.setAttribute('aria-atomic', 'true'); }

  const update = () => {
    if (count) count.textContent = data ? `${done.length} / ${data.commandCount} commands practiced · ${visibleCount} results shown` : 'Loading challenge catalog…';
  };

  function render() {
    if (!list || !data) return;
    list.replaceChildren();
    visibleCount = 0;
    const q = (search?.value || '').trim().toLowerCase();
    const group = category?.value || '';
    const setNo = Number(setSelect?.value || 0);
    const sets = setNo ? data.sets.filter(s => s.id === setNo) : data.sets;
    const commands = sets.flatMap(s => s.commands);
    for (const cmd of commands) {
      if (q && !JSON.stringify(cmd).toLowerCase().includes(q)) continue;
      if (group && group !== cmd.category) continue;
      const id = String(cmd.id);
      const set = data.sets.find(s => s.commands.some(c => String(c.id) === id));
      const article = document.createElement('article');
      article.className = 'challenge' + (done.includes(id) ? ' is-complete' : '');
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = `${set?.title || 'Challenge'} • ${cmd.category}`;
      const h = document.createElement('h2');
      h.textContent = cmd.name;
      const p = document.createElement('p');
      p.textContent = 'Practice ' + cmd.name + ': ' + cmd.summary;
      const depth = document.createElement('span');
      depth.className = 'content-depth';
      const curated = Boolean(String(cmd.example || '').trim() && String(cmd.summary || '').trim().length >= 80);
      depth.textContent = curated ? 'Curated task' : 'Catalog entry · lesson detail may be limited';
      depth.setAttribute('aria-label', curated ? 'Curated task with example' : 'Catalog entry; lesson detail may be limited');
      const actions = document.createElement('div');
      actions.className = 'challenge-actions';
      const link = document.createElement('a');
      link.className = 'lesson-link';
      link.href = cmd.url || ('/commands/' + encodeURIComponent(cmd.name) + '.html');
      link.textContent = 'Read lesson';
      const button = document.createElement('button');
      button.className = 'btn' + (done.includes(id) ? ' done' : '');
      button.type = 'button';
      const paint = () => {
        const yes = done.includes(id);
        button.textContent = yes ? '✓ Completed' : 'Mark complete';
        button.classList.toggle('done', yes);
        article.classList.toggle('is-complete', yes);
      };
      button.onclick = () => {
        if (done.includes(id)) {
          done = done.filter(x => x !== id);
          window.LinuxProgress?.updateChallenge?.(id, false);
        } else {
          done = [...done, id];
          window.LinuxProgress?.updateChallenge?.(id, true);
        }
        paint();
        update();
      };
      paint();
      actions.append(link, button);
      article.append(tag, h, p, depth, actions);
      list.append(article);
      visibleCount += 1;
    }
    update();
  }

  const setSelect = document.querySelector('#challenge-set');
  async function init() {
    try {
      const response = await fetch('/challenge-sets.json', { cache: 'force-cache' });
      if (!response.ok) throw new Error('Challenge catalog unavailable');
      data = await response.json();
      if (!Array.isArray(data.sets) || Number(data.commandCount) < 1) throw new Error('Challenge catalog is invalid');
      if (setSelect) {
        data.sets.forEach(s => {
          const option = document.createElement('option');
          option.value = s.id;
          option.textContent = s.title + ' — ' + s.commands.length + ' commands';
          setSelect.append(option);
        });
      }
      const categories = [...new Set(data.sets.flatMap(s => s.commands.map(c => c.category)))].sort();
      categories.forEach(group => {
        const option = document.createElement('option');
        option.value = group;
        option.textContent = group;
        category?.append(option);
      });
      render();
    } catch (error) {
      if (list) list.textContent = error instanceof Error ? error.message : 'Challenge catalog unavailable. Please reload.';
      update();
    }
  }

  search?.addEventListener('input', render);
  category?.addEventListener('change', render);
  setSelect?.addEventListener('change', render);
  clear?.addEventListener('click', () => {
    if (done.length && confirm('Reset all challenge progress on this browser?')) {
      window.LinuxProgress?.clearChallenges?.();
      done = [];
      render();
    }
  });

  async function initGuidedChallenges() {
    const target = document.querySelector('#guided-list');
    const progress = document.querySelector('#guided-progress');
    if (!target) return;
    try {
      const response = await fetch('/guided-challenges.json', { cache: 'force-cache' });
      if (!response.ok) throw new Error('Guided tasks are unavailable.');
      const payload = await response.json();
      if (!Array.isArray(payload.challenges) || payload.challenges.length < 10) throw new Error('Guided task catalogue is invalid.');
      const completed = () => new Set((window.LinuxProgress?.read().tutorials || []).map(item => String(item.id)).filter(id => id.startsWith('guided-')));
      const updateProgress = () => { if (progress) progress.textContent = completed().size + ' / ' + payload.challenges.length + ' guided tasks completed'; };
      target.replaceChildren();
      for (const task of payload.challenges) {
        const article = document.createElement('article');
        article.className = 'guided-card';
        const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = task.category + ' · ' + task.level;
        const title = document.createElement('h3'); title.textContent = task.title;
        const prompt = document.createElement('p'); prompt.textContent = task.prompt;
        const choices = document.createElement('div'); choices.className = 'guided-choices';
        const feedback = document.createElement('p'); feedback.className = 'guided-feedback'; feedback.setAttribute('role','status'); feedback.setAttribute('aria-live','polite');
        const doneId = 'guided-' + task.id;
        let locked = completed().has(doneId);
        const paint = () => { article.classList.toggle('is-complete', locked); };
        for (const [index, choice] of task.choices.entries()) {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'guided-choice'; button.textContent = choice;
          if (locked) button.disabled = true;
          button.addEventListener('click', () => {
            if (locked) return;
            if (index === task.answerIndex) {
              locked = true;
              for (const option of choices.querySelectorAll('button')) option.disabled = true;
              button.classList.add('is-correct');
              feedback.textContent = 'Correct. ' + task.explanation;
              window.LinuxProgress?.completeTutorial(doneId, task.title);
              paint(); updateProgress();
            } else {
              button.classList.add('is-incorrect');
              button.disabled = true;
              feedback.textContent = 'Not quite. Try another option. ' + task.hint;
            }
          });
          choices.append(button);
        }
        if (locked) feedback.textContent = 'Completed earlier. ' + task.explanation;
        article.append(tag,title,prompt,choices,feedback); target.append(article); paint();
      }
      updateProgress();
    } catch (error) {
      target.textContent = error instanceof Error ? error.message : 'Guided tasks are unavailable.';
      if (progress) progress.textContent = 'Progress unavailable';
    }
  }

  void init();
  void initGuidedChallenges();
})();