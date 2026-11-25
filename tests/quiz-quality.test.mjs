import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/quiz.ts', import.meta.url), 'utf8');
const html = await readFile(new URL('../quiz/index.html', import.meta.url), 'utf8');
const guided = JSON.parse(await readFile(new URL('../public/guided-challenges.json', import.meta.url), 'utf8'));
const commonBlock = source.match(/const COMMON: Question\[\] = \[([\s\S]*?)\n\];/);
assert.ok(commonBlock, 'the curated core question bank must exist');
const commonCount = (commonBlock[1].match(/id: 'scenario-/g) || []).length;

assert.match(source, /fetch\('\/guided-challenges\.json'/, 'guided scenarios must be part of the quiz bank');
assert.equal(source.split("QUESTIONS.push(...COMMON)").length - 1, 1, 'the core question set must be appended exactly once');
assert.match(source, /SESSION_SIZE = 50/, 'the session size must match the currently authored bank');
assert.match(source, /bankSize\.textContent = .*QUESTIONS\.length/, 'the UI must report the actual available question count');
assert.doesNotMatch(source, /command-records\.json|namesByCategory|examplesByCategory|pickDistractors/, 'catalogue placeholders must not be treated as authored quiz questions');
assert.doesNotMatch(html, /500 Linux Quiz|500-question practice quiz/, 'the page must not claim a 500-question bank');
assert.ok(guided.challenges.length >= 10, 'the guided scenario bank must be present');
for (const task of guided.challenges) {
  assert.ok(task.id && task.prompt && task.explanation, 'every guided question needs an ID, prompt and explanation');
  assert.equal(task.choices.length, 4, task.id + ' must have four answer choices');
  assert.equal(new Set(task.choices).size, 4, task.id + ' must have distinct choices');
  assert.ok(Number.isInteger(task.answerIndex) && task.answerIndex >= 0 && task.answerIndex < 4, task.id + ' must have a valid answer key');
}
assert.ok(commonCount >= 30, 'the authored core question bank must contain at least 30 questions');
assert.equal(commonCount + guided.challenges.length, 50, 'the published bank should contain exactly 50 curated questions');
console.log('Curated quiz bank and guided challenge answer-key checks passed (' + (commonCount + guided.challenges.length) + ' questions).');
