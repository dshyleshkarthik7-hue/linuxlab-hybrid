import { strict as assert } from 'node:assert';
import { P1Runtime } from '../src/product/P1Runtime.ts';

const runtime = new P1Runtime('intermediate');
const ok = await runtime.execute('echo hello');
assert.equal(ok.result.exitCode, 0);
assert.match(ok.tutorContext.explanation, /shell|command|Use the shell/i);
assert.match(ok.tutorContext.nextStep, /pipeline|conditional|argument/i);
assert.equal(runtime.observatory.recentCommands().length, 1);
const telemetry = runtime.observatory.system();
assert.equal(telemetry.commandCount, 1);
assert.equal(telemetry.failedCommandCount, 0);
const bad = await runtime.execute('does-not-exist');
assert.notEqual(bad.result.exitCode, 0);
assert.equal(runtime.observatory.system().failedCommandCount, 1);
console.log('Observatory and contextual tutor checks passed');
