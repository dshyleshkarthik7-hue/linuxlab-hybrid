import { strict as assert } from 'node:assert';
import type { CommandResult } from '../src/engine/CommandResult.ts';

const result: CommandResult = { stdout: 'ok\n', stderr: '', exitCode: 0, durationMs: 1 };
assert.equal(result.stdout, 'ok\n');
assert.equal(result.stderr, '');
assert.equal(result.exitCode, 0);
assert.ok(result.durationMs >= 0);

const failure: CommandResult = { stdout: '', stderr: 'not found\n', exitCode: 127, durationMs: 2 };
assert.equal(failure.exitCode, 127);
assert.equal(failure.stdout, '');
assert.match(failure.stderr, /not found/);
console.log('CommandResult contract checks passed');
