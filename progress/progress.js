import { exportSnapshot, importSnapshot } from './progress-snapshot.mjs';

document.addEventListener('DOMContentLoaded', () => {
  const $ = (selector) => document.querySelector(selector);
  const fmt = (value) => new Date(value).toLocaleString();
  const catalogCount = () => Number(window.LinuxProgress?.catalog?.()?.challengeCount) || 6161;

  function renderBadges(state) {
    const host = $('#achievement-badges');
    if (!host) return;
    host.replaceChildren();
    const quizPct = state.quiz?.bestTotal ? Math.round(state.quiz.bestScore / state.quiz.bestTotal * 100) : 0;
    const definitions = [
      { name: 'First Steps', tier: 'Bronze', description: 'Complete your first tutorial or challenge.', unlocked: state.tutorialCount >= 1 || state.challengeCount >= 1, progress: Math.min(1, Math.max(state.tutorialCount, state.challengeCount)) },
      { name: 'Practice Builder', tier: 'Bronze', description: 'Complete 10 challenges and 3 tutorials.', unlocked: state.challengeCount >= 10 && state.tutorialCount >= 3, progress: Math.min(state.challengeCount / 10, state.tutorialCount / 3) },
      { name: 'Quiz Ready', tier: 'Silver', description: 'Score at least 80% on a recorded practice quiz.', unlocked: quizPct >= 80, progress: Math.min(1, quizPct / 80) },
      { name: 'Shell Scripter', tier: 'Silver', description: 'Complete 25 command challenges.', unlocked: state.challengeCount >= 25, progress: Math.min(1, state.challengeCount / 25) },
      { name: 'Century Club', tier: 'Gold', description: 'Complete 100 command challenges.', unlocked: state.challengeCount >= 100, progress: Math.min(1, state.challengeCount / 100) },
      { name: 'Path Complete', tier: 'Gold', description: 'Complete 10 tutorials and 50 challenges.', unlocked: state.tutorialCount >= 10 && state.challengeCount >= 50, progress: Math.min(state.tutorialCount / 10, state.challengeCount / 50) },
      { name: 'Advanced Learner', tier: 'Platinum', description: 'Complete 100 challenges, 10 tutorials, and score 80% on a quiz.', unlocked: state.challengeCount >= 100 && state.tutorialCount >= 10 && quizPct >= 80, progress: Math.min(state.challengeCount / 100, state.tutorialCount / 10, quizPct / 80) },
      { name: 'Dedicated', tier: 'Platinum', description: 'Earn 500 learning points.', unlocked: state.points >= 500, progress: Math.min(1, state.points / 500) }
    ];
    for (const badge of definitions) {
      const card = document.createElement('article');
      card.className = 'achievement-badge' + (badge.unlocked ? ' is-unlocked' : ' is-locked');
      card.setAttribute('aria-label', badge.name + ', ' + (badge.unlocked ? 'unlocked' : 'locked'));
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('aria-hidden', 'true');
      const circle = document.createElementNS(svg.namespaceURI, 'circle');
      circle.setAttribute('cx', '50'); circle.setAttribute('cy', '50'); circle.setAttribute('r', '42'); circle.setAttribute('class', 'badge-ring');
      const star = document.createElementNS(svg.namespaceURI, 'path');
      star.setAttribute('d', 'M50 22 L58 40 L78 42 L63 56 L67 76 L50 66 L33 76 L37 56 L22 42 L42 40 Z'); star.setAttribute('class', 'badge-star');
      svg.append(circle, star);
      const title = document.createElement('h3'); title.textContent = badge.name;
      const tier = document.createElement('span'); tier.className = 'badge-tier'; tier.textContent = badge.tier;
      const description = document.createElement('p'); description.textContent = badge.description;
      const status = document.createElement('strong'); status.textContent = badge.unlocked ? 'Unlocked' : 'Not yet unlocked';
      const progress = document.createElement('progress'); progress.max = 100; progress.value = Math.round(badge.progress * 100); progress.setAttribute('aria-label', badge.name + ' progress');
      const percent = document.createElement('small'); percent.textContent = badge.unlocked ? '100% complete' : Math.round(badge.progress * 100) + '% complete';
      card.append(svg, title, tier, description, status, progress, percent);
      host.append(card);
    }
    const next = definitions.find((badge) => !badge.unlocked);
    const nextHost = $('#next-badge-progress');
    if (nextHost) nextHost.textContent = next ? `Next badge: ${next.name} — ${Math.round(next.progress * 100)}% toward unlock.` : 'All current badges unlocked. Keep learning to maintain your skills.';
  }

  function showCertificate(certificate) {
    const box = $('#certificate-result'); box.replaceChildren();
    const card = document.createElement('div'); card.className = 'certificate';
    const heading = document.createElement('h3'); heading.textContent = 'LinuxTerminal Learning Completion';
    const paragraph = document.createElement('p'); const strong = document.createElement('strong'); strong.textContent = certificate.name; paragraph.append(strong, ' completed the local learning path.');
    const details = document.createElement('p'); details.textContent = `${certificate.challenges}/${catalogCount().toLocaleString()} command practice items · ${certificate.quizScore}/${certificate.quizTotal} quiz · ${certificate.points} points`;
    const meta = document.createElement('small'); meta.textContent = `Issued ${fmt(certificate.issuedAt)} · ID ${certificate.id}`;
    const print = document.createElement('button'); print.className = 'print'; print.textContent = 'Print certificate'; print.addEventListener('click', () => window.print());
    card.append(heading, paragraph, details, meta, print); box.append(card);
  }

  function render() {
    const state = window.LinuxProgress?.summary();
    if (!state) return;
    renderBadges(state);
    $('#points').textContent = state.points;
    $('#tutorials').textContent = state.tutorialCount;
    $('#challenges').textContent = `${state.challengeCount} / ${catalogCount().toLocaleString()}`;
    $('#sessions').textContent = state.sessionCount;
    $('#quiz').textContent = state.quiz.bestTotal ? `${state.quiz.bestScore}/${state.quiz.bestTotal} (${Math.round(state.quiz.bestScore / state.quiz.bestTotal * 100)}%)` : 'Not started';
    $('#name').value = state.name || '';
    const list = $('#session-list'); list.replaceChildren();
    if (!state.sessions.length) list.textContent = 'No previous sessions yet.';
    else state.sessions.slice(0, 12).forEach((session) => {
      const row = document.createElement('div'); row.className = 'session';
      const title = document.createElement('strong'); title.textContent = session.page;
      const meta = document.createElement('small'); meta.textContent = `${fmt(session.startedAt)} · last active ${fmt(session.lastSeenAt)}`;
      row.append(title, document.createElement('br'), meta); list.append(row);
    });
    const eligible = window.LinuxProgress.eligible();
    $('#certificate').hidden = !eligible;
    $('#eligibility').textContent = eligible
      ? `You completed all ${catalogCount().toLocaleString()} catalog practice items and reached 80% on the practice quiz. This is a browser-local learning completion certificate; the verified assessment certificate remains at /certificate/.`
      : `Complete the catalog practice items and reach 80% on the practice quiz to unlock a local learning completion certificate.`;
    const existing = state.certificates.find((item) => item.type === 'learning-completion');
    if (existing) showCertificate(existing);
  }

  $('#save-name')?.addEventListener('click', () => { window.LinuxProgress?.setName($('#name').value); render(); });
  $('#certificate')?.addEventListener('click', () => { const certificate = window.LinuxProgress?.issueLocalCertificate($('#name').value); if (certificate) showCertificate(certificate); render(); });
  $('#reset')?.addEventListener('click', () => { if (confirm('Reset every local tutorial, challenge, quiz and session record?')) { window.LinuxProgress?.reset(); location.reload(); } });

  $('#export-badges')?.addEventListener('click', () => {
    const state = window.LinuxProgress?.summary();
    if (!state) return;
    const quizPct = state.quiz?.bestTotal ? Math.round(state.quiz.bestScore / state.quiz.bestTotal * 100) : 0;
    const badges = [
      ['First Steps', state.tutorialCount >= 1 || state.challengeCount >= 1],
      ['Practice Builder', state.challengeCount >= 10 && state.tutorialCount >= 3],
      ['Quiz Ready', quizPct >= 80],
      ['Shell Scripter', state.challengeCount >= 25],
      ['Century Club', state.challengeCount >= 100],
      ['Path Complete', state.tutorialCount >= 10 && state.challengeCount >= 50],
      ['Advanced Learner', state.challengeCount >= 100 && state.tutorialCount >= 10 && quizPct >= 80],
      ['Dedicated', state.points >= 500]
    ].filter((item) => item[1]).map((item) => item[0]);
    const escapeXml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const badgeText = badges.length ? badges : ['No badges unlocked yet'];
    const rows = badgeText.map((name, index) => `<g transform="translate(40 ${118 + index * 34})"><circle cx="10" cy="-6" r="7" fill="#4ade80"/><text x="28" y="0" fill="#e8f1ff" font-size="20">${escapeXml(name)}</text></g>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${Math.max(240, 150 + badgeText.length * 34)}" viewBox="0 0 900 ${Math.max(240, 150 + badgeText.length * 34)}"><rect width="100%" height="100%" rx="24" fill="#061426"/><text x="40" y="52" fill="#43d9ff" font-family="system-ui,sans-serif" font-size="16">LINUXTERMINAL · LOCAL LEARNING BADGES</text><text x="40" y="88" fill="#ffffff" font-family="system-ui,sans-serif" font-size="28">${escapeXml(state.name || 'Linux learner')}</text>${rows}<text x="40" y="${Math.max(210, 118 + badgeText.length * 34)}" fill="#9bb0c9" font-family="system-ui,sans-serif" font-size="13">Generated locally · Not a verified credential</text></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const link = document.createElement('a'); link.href = url; link.download = 'linuxterminal-badges.svg'; link.click(); URL.revokeObjectURL(url);
  });

  const status = $('#snapshot-status');
  $('#export-progress')?.addEventListener('click', () => {
    try {
      const snapshot = exportSnapshot(window.LinuxProgress.read());
      const url = URL.createObjectURL(new Blob([snapshot], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'linuxterminal-progress.json'; link.click();
      URL.revokeObjectURL(url);
      status.textContent = 'Progress exported to a JSON file on your device. It was not uploaded.';
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not export progress.'; }
  });
  const file = $('#progress-file');
  $('#import-progress')?.addEventListener('click', () => file?.click());
  file?.addEventListener('change', async () => {
    const selected = file.files?.[0]; if (!selected) return;
    try {
      if (selected.size > 1024 * 1024) throw new Error('Choose a progress JSON file smaller than 1 MiB.');
      const snapshot = importSnapshot(await selected.text());
      if (!confirm('Replace the progress stored in this browser with the imported snapshot? Export your current progress first if you want a backup.')) return;
      window.LinuxProgress.replaceSnapshot(snapshot);
      status.textContent = 'Progress imported locally. No data was uploaded.';
      render();
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not import this progress file.'; }
    finally { file.value = ''; }
  });

  render();
  window.LinuxProgress?.ready?.then(render);
});
