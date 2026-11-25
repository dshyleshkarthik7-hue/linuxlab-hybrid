import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/quiz.ts', import.meta.url), 'utf8');
const guided = JSON.parse(await readFile(new URL('../public/guided-challenges.json', import.meta.url), 'utf8'));
assert.match(source, /fetch\('\/guided-challenges\.json'/);
assert.match(source, /QUESTIONS\.push\(\.\.\.COMMON\)/);
assert.match(source, /guided challenge has an invalid question or answer key/i);
assert.match(source, /duplicate question IDs/i);
assert.match(source, /getRandomValues/);
assert.match(source, /session\s*=\s*shuffle\(QUESTIONS\)/);
assert.match(source, /currently available/);
assert.match(source, /const SESSION_SIZE = 50/);
assert.match(source, /QUESTIONS.length < 45/);
assert.equal((source.match(/id: 'scenario-/g) || []).length, 35, 'the common foundation question bank should remain stable');
assert.doesNotMatch(source, /command-records\.json|namesByCategory|examplesByCategory|pickDistractors/);
assert.ok(guided.challenges.length >= 10);
for (const task of guided.challenges) {
  assert.equal(task.choices.length, 4, task.id);
  assert.equal(new Set(task.choices).size, 4, task.id);
  assert.ok(task.answerIndex >= 0 && task.answerIndex < task.choices.length, task.id);
}
console.log('Curated quiz bank and guided challenge answer-key checks passed (' + (guided.challenges.length + 35) + ' expected questions).');
