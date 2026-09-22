import { strict as assert } from 'node:assert';
import { COMMAND_LESSONS, findCommand } from '../src/commands/commandCatalog.ts';

const COMMAND_INDEX = COMMAND_LESSONS.map(({ name, summary: description, example }) => ({ name, description, example }));

assert.equal(COMMAND_LESSONS.length, 200, 'The learner curriculum must expose exactly 200 commands');
assert.equal(new Set(COMMAND_LESSONS.map((command) => command.name)).size, 200, 'Command names must be unique');
for (const command of COMMAND_LESSONS) {
  assert.ok(command.name.length > 0);
  assert.ok(command.category.length > 0);
  assert.ok(command.summary.length > 0);
  assert.ok(command.example.length > 0);
}
assert.equal(COMMAND_INDEX.length, COMMAND_LESSONS.length, 'The sitemap command index must match the learner catalog');
assert.deepEqual(COMMAND_INDEX, COMMAND_LESSONS.map(({ name, summary: description, example }) => ({ name, description, example })));
assert.equal(findCommand('pwd')?.category, 'navigation');
assert.equal(findCommand('chmod')?.category, 'permissions');
assert.equal(findCommand('strace')?.category, 'processes');
assert.equal(findCommand('nonexistent'), undefined);
console.log('200-command curriculum and derived sitemap catalog checks passed');