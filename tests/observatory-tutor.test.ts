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
const real = new (runtime.observatory.constructor as any)('REAL');
assert.throws(() => real.system(), /REAL telemetry unavailable/);
assert.throws(() => real.setGuestTelemetry({ kernel: '', architecture: 'x86_64', cpuPercent: 0, memoryBytes: 0, diskBytes: 0, uptimeSeconds: 0, loadAverage: 0 }), /invalid guest telemetry/);
real.setGuestTelemetry({ kernel: '6.6', architecture: 'x86_64', cpuPercent: 12, memoryBytes: 1024, diskBytes: 2048, uptimeSeconds: 3, loadAverage: 0.5 });
assert.equal(real.hasGuestTelemetry(), true);
assert.equal(real.system().source, 'REAL');
real.clearGuestTelemetry();
assert.equal(real.hasGuestTelemetry(), false);
assert.throws(() => real.spawn('x'.repeat(4097)), /invalid process command/);
assert.throws(() => real.spawn('x', -1), /invalid parent pid/);

console.log('Observatory and contextual tutor checks passed');
