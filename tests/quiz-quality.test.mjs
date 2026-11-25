import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/quiz.ts', import.meta.url), 'utf8');
const guided = JSON.parse(await readFile(new URL('../public/guided-challenges.json', import.meta.url), 'utf8'));
const commonStart = source.indexOf('const COMMON:');
const commonEnd = source.indexOf('];', commonStart);
assert.ok(commonStart >= 0 && commonEnd > commonStart, 'curated core questions must exist');
const commonCount = (source.slice(commonStart, commonEnd).match(/id: '/g) || []).length;

assert.ok(source.includes("fetch('/guided-challenges.json'"), 'quiz must use the reviewed guided scenario bank');
assert.ok(source.includes('QUESTIONS.push(...COMMON)'), 'quiz must include the curated core question bank');
assert.ok(source.includes('Guided challenge has an invalid question or answer key'));
assert.ok(source.includes('Quiz bank contains duplicate question IDs'));
assert.ok(source.includes('crypto.getRandomValues'));
assert.ok(source.includes('session = shuffle(QUESTIONS)'));
assert.ok(source.includes('currently available'));
assert.ok(!source.includes('/command-records.json'), 'catalogue placeholders must not be used as quiz questions');
assert.ok(guided.challenges.length >= 10);

for (const task of guided.challenges) {
  assert.equal(task.choices.length, 4, task.id);
  assert.equal(new Set(task.choices).size, 4, task.id);
  assert.ok(Number.isInteger(task.answerIndex) && task.answerIndex >= 0 && task.answerIndex < task.choices.length, task.id);
}
assert.equal(commonCount, 35, 'the curated core bank should contain 35 reviewed questions');
assert.ok(commonCount + guided.challenges.length >= 45, 'the curated question bank must contain enough questions');

console.log('Curated quiz bank and guided challenge answer-key checks passed (' + (guided.challenges.length + commonCount) + ' questions).');
