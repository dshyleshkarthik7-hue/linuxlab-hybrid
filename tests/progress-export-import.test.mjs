import assert from 'node:assert/strict';
import { exportSnapshot, importSnapshot, validateSnapshot } from '../public/progress-snapshot.mjs';

const original = {
  version: 2, name: 'Learner', points: 42,
  tutorials: [{ id: 'linux-basics', title: 'Linux Basics', completedAt: '2026-10-01T10:00:00.000Z' }],
  challenges: [{ id: 'chmod', title: 'chmod', completedAt: '2026-10-02T10:00:00.000Z' }],
  quiz: { attempts: 2, bestScore: 9, bestTotal: 10, passed: true, lastAt: '2026-10-03T10:00:00.000Z' },
  sessions: [{ id: 's1', startedAt: '2026-10-01T10:00:00.000Z', lastSeenAt: '2026-10-01T10:10:00.000Z', page: '/progress/' }],
  certificates: [{ id: 'c1', type: 'learning-completion', name: 'Learner', issuedAt: '2026-10-04T10:00:00.000Z', points: 42, challenges: 1, quizScore: 9, quizTotal: 10 }]
};
const encoded = exportSnapshot(original);
const restored = importSnapshot(encoded);
assert.equal(restored.name, original.name);
assert.equal(restored.points, original.points);
assert.deepEqual(restored.tutorials, original.tutorials);
assert.deepEqual(restored.challenges, original.challenges);
assert.deepEqual(restored.quiz, original.quiz);
assert.deepEqual(restored.sessions, original.sessions);
assert.deepEqual(restored.certificates, original.certificates);
assert.throws(() => importSnapshot('{"format":"other","version":2}'), /not a LinuxTerminal progress export/);
assert.throws(() => importSnapshot('{"format":"linuxterminal-progress","version":9}'), /Unsupported progress snapshot version/);
assert.throws(() => importSnapshot('not json'), /valid JSON/);
assert.throws(() => importSnapshot(JSON.stringify({ format: 'linuxterminal-progress', version: 2, quiz: { bestScore: 11, bestTotal: 10 } })), /out of range/);
assert.throws(() => importSnapshot('{"format":"linuxterminal-progress","version":2,"__proto__":{"polluted":true}}'), /forbidden property/);
assert.throws(() => importSnapshot(' '.repeat(1024 * 1024 + 1)), /larger than 1 MiB/);
assert.throws(() => validateSnapshot({ version: 2, challenges: 'not-an-array' }), /invalid challenges list/);
console.log('Progress snapshot round-trip and malicious-input contracts passed');
