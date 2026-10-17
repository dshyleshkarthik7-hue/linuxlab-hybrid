import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../netlify/functions/certificate.mts', import.meta.url), 'utf8');
const start = source.indexOf('const FUNDAMENTAL_ITEMS:');
const end = source.indexOf(';\nconst FUNDAMENTAL_BANK', start);
assert.ok(start >= 0 && end > start, 'curated foundational questions must exist');
const equals = source.indexOf('=', start);
const rows = JSON.parse(source.slice(equals + 1, end).trim());

assert.ok(rows.length >= 50, 'assessment must retain a broad curated fundamentals set');
for (const [id, question, scenario, answer, ...distractors] of rows) {
  assert.ok(id && question && scenario && answer, 'every curated question needs a stable ID, two prompts and an answer');
  assert.equal(new Set([answer, ...distractors.slice(0, 3)]).size, 4, id + ' must have four unique choices');
  for (const prompt of [question, scenario]) {
    assert.ok(!prompt.toLocaleLowerCase().includes(answer.toLocaleLowerCase()), id + ' must not reveal its answer in either prompt');
  }
}

assert.match(source, /const bank = \[\.\.\.COMMON_BANK, \.\.\.FUNDAMENTAL_BANK\]/);
assert.doesNotMatch(source, /COMMAND_RECORDS|cmd-\$\{index\}-purpose|cmd-\$\{index\}-category|cmd-\$\{index\}-example/);
assert.match(source, /Curated exam question leaks its answer in the question text/);
console.log('Curated certificate question quality and answer-leak checks passed (' + rows.length + ' scenarios).');
