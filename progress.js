/* LinuxTerminal local learning ledger. No command text, VM output, or secrets are stored. */
(function () {
  const KEY = 'linuxterminal.learning.v2';
  const MAX_SESSIONS = 30;
  const now = () => new Date().toISOString();
  const id = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const empty = () => ({
    version: 2,
    name: '',
    points: 0,
    tutorials: [],
    challenges: [],
    quiz: { attempts: 0, bestScore: 0, bestTotal: 0, passed: false, lastAt: null },
    sessions: [],
    certificates: []
  });

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      const x = raw ? JSON.parse(raw) : empty();
      return {
        ...empty(),
        ...x,
        tutorials: Array.isArray(x.tutorials) ? x.tutorials : [],
        challenges: Array.isArray(x.challenges) ? x.challenges : [],
        sessions: Array.isArray(x.sessions) ? x.sessions : [],
        certificates: Array.isArray(x.certificates) ? x.certificates : [],
        quiz: { ...empty().quiz, ...(x.quiz || {}) }
      };
    } catch (error) {
      return empty();
    }
  }

  function write(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (error) {
      // Local storage can be unavailable in private or restricted browser contexts.
    }
    return state;
  }

  function update(fn) {
    const state = read();
    fn(state);
    return write(state);
  }

  function startSession(page) {
    const session = {
      id: id('session'),
      startedAt: now(),
      lastSeenAt: now(),
      page: String(page || location.pathname)
    };
    update((state) => {
      state.sessions.unshift(session);
      state.sessions = state.sessions.slice(0, MAX_SESSIONS);
    });
    return session.id;
  }

  function touch(sessionId, page) {
    update((state) => {
      const session = state.sessions.find((value) => value.id === sessionId);
      if (session) {
        session.lastSeenAt = now();
        session.page = String(page || session.page);
      }
    });
  }

  function setName(name) {
    const value = String(name || '').trim().slice(0, 80);
    update((state) => {
      state.name = value;
    });
    return value;
  }

  function completeTutorial(id, title) {
    update((state) => {
      if (!state.tutorials.some((item) => item.id === id)) {
        state.tutorials.push({ id, title: title || id, completedAt: now() });
        state.points += 25;
      }
    });
  }

  function completeChallenge(id, title) {
    update((state) => {
      if (!state.challenges.some((item) => item.id === id)) {
        state.challenges.push({ id, title: title || id, completedAt: now() });
        state.points += 10;
      }
    });
  }

  function recordQuiz(score, total) {
    score = Math.max(0, Number(score) || 0);
    total = Math.max(1, Number(total) || 1);
    update((state) => {
      const previous = Number(state.quiz.bestScore) || 0;
      state.quiz.attempts += 1;
      state.quiz.lastAt = now();
      if (score > previous || total !== state.quiz.bestTotal) {
        state.points += Math.max(0, score - previous);
        state.quiz.bestScore = score;
        state.quiz.bestTotal = total;
      }
      state.quiz.passed = score / total >= 0.8 || state.quiz.passed;
    });
  }

  function eligible() {
    const state = read();
    return state.challenges.length >= 100 &&
      state.quiz.bestTotal > 0 &&
      state.quiz.bestScore / state.quiz.bestTotal >= 0.8;
  }

  function issueLocalCertificate(name) {
    const state = read();
    if (!eligible()) return null;
    const existing = state.certificates.find((item) => item.type === 'learning-completion');
    if (existing) return existing;
    const certificate = {
      id: `LT-LRN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      type: 'learning-completion',
      name: String(name || state.name || 'Linux learner').trim().slice(0, 80),
      issuedAt: now(),
      points: state.points,
      challenges: state.challenges.length,
      quizScore: state.quiz.bestScore,
      quizTotal: state.quiz.bestTotal
    };
    state.certificates.push(certificate);
    state.points += 100;
    write(state);
    return certificate;
  }

  function reset() {
    write(empty());
  }

  function summary() {
    const state = read();
    return {
      ...state,
      challengeCount: state.challenges.length,
      tutorialCount: state.tutorials.length,
      sessionCount: state.sessions.length
    };
  }

  const sessionId = startSession(location.pathname);
  addEventListener('pagehide', () => touch(sessionId, location.pathname));
  setInterval(() => touch(sessionId, location.pathname), 60000);

  function watchQuiz() {
    const result = document.querySelector('#result');
    if (!result) return;
    const capture = () => {
      const match = (result.textContent || '').match(/(?:Exact score|Final score):\s*(\d+)\s*\/\s*(\d+)/i);
      if (match) {
        const key = `${match[1]}/${match[2]}`;
        if (result.dataset.logged !== key) {
          result.dataset.logged = key;
          recordQuiz(Number(match[1]), Number(match[2]));
        }
      }
    };
    new MutationObserver(capture).observe(result, {
      childList: true,
      subtree: true,
      characterData: true
    });
    capture();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchQuiz);
  } else {
    watchQuiz();
  }

  window.LinuxProgress = {
    read,
    summary,
    setName,
    completeTutorial,
    completeChallenge,
    recordQuiz,
    eligible,
    issueLocalCertificate,
    reset
  };
})();
