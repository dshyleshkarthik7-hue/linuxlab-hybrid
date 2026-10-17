const MAX_BYTES = 1024 * 1024;
const MAX_ITEMS = 20000;
const text = (value, max = 300) => typeof value === 'string' ? value.slice(0, max) : '';
const number = (value, fallback = 0) => Number.isFinite(value) && value >= 0 ? value : fallback;
const date = (value) => typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value)) ? value : null;

export function validateSnapshot(input) {
  let value = input;
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).byteLength > MAX_BYTES) throw new Error('Snapshot file is larger than 1 MiB.');
    try { value = JSON.parse(input); } catch { throw new Error('Snapshot is not valid JSON.'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Snapshot must be a JSON object.');
  if (value.version !== 2) throw new Error('Unsupported progress snapshot version.');
  for (const key of ['__proto__', 'prototype', 'constructor']) if (Object.hasOwn(value, key)) throw new Error('Snapshot contains a forbidden property.');
  for (const key of ['tutorials', 'challenges', 'sessions', 'certificates']) {
    if (value[key] !== undefined && (!Array.isArray(value[key]) || value[key].length > MAX_ITEMS)) throw new Error('Snapshot has an invalid ' + key + ' list.');
  }
  if (value.quiz !== undefined && (!value.quiz || typeof value.quiz !== 'object' || Array.isArray(value.quiz))) throw new Error('Snapshot quiz record is invalid.');
  const tutorials = (value.tutorials || []).map((item) => {
    if (!item || typeof item !== 'object' || !text(item.id, 160)) throw new Error('Snapshot contains an invalid tutorial record.');
    return { id: text(item.id, 160), title: text(item.title, 300), completedAt: date(item.completedAt) };
  });
  const challenges = (value.challenges || []).map((item) => {
    const record = typeof item === 'string' || typeof item === 'number' ? { id: String(item) } : item;
    if (!record || typeof record !== 'object' || !text(String(record.id ?? ''), 160)) throw new Error('Snapshot contains an invalid challenge record.');
    return { id: text(String(record.id), 160), title: text(record.title, 300), completedAt: date(record.completedAt) };
  });
  const sessions = (value.sessions || []).map((item) => {
    if (!item || typeof item !== 'object' || !date(item.startedAt)) throw new Error('Snapshot contains an invalid session record.');
    return { id: text(item.id, 160), startedAt: date(item.startedAt), lastSeenAt: date(item.lastSeenAt) || date(item.startedAt), page: text(item.page, 300) };
  });
  const certificates = (value.certificates || []).map((item) => {
    if (!item || typeof item !== 'object' || !text(item.id, 160) || !date(item.issuedAt)) throw new Error('Snapshot contains an invalid certificate record.');
    return { id: text(item.id, 160), type: text(item.type, 80), name: text(item.name, 80), issuedAt: date(item.issuedAt), points: number(item.points), challenges: number(item.challenges), quizScore: number(item.quizScore), quizTotal: number(item.quizTotal) };
  });
  const quiz = value.quiz || {};
  const bestScore = number(quiz.bestScore), bestTotal = number(quiz.bestTotal);
  if (bestScore > bestTotal || bestTotal > 100000) throw new Error('Snapshot quiz score is out of range.');
  return {
    version: 2,
    name: text(value.name, 80),
    points: number(value.points),
    tutorials,
    challenges,
    quiz: { attempts: Math.min(1000000, Math.floor(number(quiz.attempts))), bestScore, bestTotal, passed: quiz.passed === true, lastAt: date(quiz.lastAt) },
    sessions: sessions.slice(0, 30),
    certificates
  };
}

export function exportSnapshot(state) {
  const snapshot = validateSnapshot({ ...state, version: 2 });
  return JSON.stringify({ format: 'linuxterminal-progress', exportedAt: new Date().toISOString(), ...snapshot }, null, 2);
}

export function importSnapshot(input) {
  let value = input;
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).byteLength > MAX_BYTES) throw new Error('Snapshot file is larger than 1 MiB.');
    try { value = JSON.parse(input); } catch { throw new Error('Snapshot is not valid JSON.'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Snapshot must be a JSON object.');
  if (value.format !== 'linuxterminal-progress') throw new Error('This is not a LinuxTerminal progress export.');
  return validateSnapshot(value);
}
