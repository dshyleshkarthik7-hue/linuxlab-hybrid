import { strict as assert } from 'node:assert';
import { ShellParser } from '../src/engine/ShellParser.ts';
import { ShellPlanner } from '../src/engine/ShellPlanner.ts';
import { StructuredLinuxEngine } from '../src/engine/StructuredLinuxEngine.ts';
import { summarizeAssessment } from '../src/engine/AssessmentTypes.ts';
import { LinuxObservatory } from '../src/observability/LinuxObservatory.ts';
import { SessionManager } from '../src/core/SessionManager.ts';
import { ALPINE_ARTIFACT, verifyArtifact } from '../src/core/ISOIntegrity.ts';

const parser = new ShellParser();
assert.equal(parser.parse('echo "a && b"').type, 'command');
assert.equal(parser.parse("echo 'a | b'").type, 'command');
assert.throws(() => parser.parse('echo "unterminated'), /Unterminated quote/);
assert.throws(() => parser.parse('echo foo ||'), /Expected command/);
assert.equal(parser.parse('echo | bar').type, 'binary');
assert.throws(() => parser.parse('echo |'), /Expected command/);
assert.throws(() => parser.parse('echo &&'), /Expected command/);

const plan = new ShellPlanner().plan(parser.parse('printf hello | wc -c && echo done'));
assert.equal(plan.kind, 'and');
assert.equal(plan.left.kind, 'pipeline');

const engine = new StructuredLinuxEngine();
const echo = await engine.executeResult('echo hello');
assert.equal(echo.exitCode, 0);
assert.match(echo.stdout, /hello/);
assert.equal(echo.stderr, '');
const missing = await engine.executeResult('cat /does-not-exist');
assert.notEqual(missing.exitCode, 0);
assert.match(missing.stderr, /No such file|not found/i);
const redirected = await engine.executeResult('echo saved > /root/p0.txt');
assert.equal(redirected.exitCode, 0);
assert.equal(await engine.executeResult('cat /root/p0.txt').then(r => r.stdout.trim()), 'saved');
const piped = await engine.executeResult('printf hello | wc -c');
assert.equal(piped.exitCode, 0);
assert.match(piped.stdout, /5/);
const rejected = await engine.executeResult(':(){ :|:& };:');
assert.equal(rejected.exitCode, 126);
assert.match(rejected.stderr, /sandbox safety policy/);
const tooLong = await engine.executeResult('x'.repeat(64_001));
assert.equal(tooLong.exitCode, 2);

const assessment = summarizeAssessment([
  { label: 'verified', state: 'passed', feedback: 'ok' },
  { label: 'disproved', state: 'failed', feedback: 'no' },
  { label: 'unknown', state: 'unable-to-verify', feedback: 'insufficient evidence' },
]);
assert.equal(assessment.score, null);
assert.equal(assessment.unableToVerify, 1);

const observatory = new LinuxObservatory();
assert.equal(observatory.label(), '● SIMULATED TELEMETRY');
const p = observatory.spawn('grep hello');
assert.equal(p.ppid, 2);
assert.ok(observatory.processTree().some(x => x.pid === p.pid));
assert.equal(observatory.exit(p.pid), true);

let stopped = 0;
const session = new SessionManager({ cpuMs: 50, memoryBytes: 1, diskBytes: 1, processCount: 1, timeoutMs: 10 }, async () => { stopped++; });
await session.start(async () => {});
await new Promise(resolve => setTimeout(resolve, 30));
assert.equal(session.getState(), 'STOPPED');
assert.equal(stopped, 1);

await assert.rejects(() => verifyArtifact(new ArrayBuffer(0), ALPINE_ARTIFACT), /no trusted SHA-256 digest configured/);
assert.match(ALPINE_ARTIFACT.filename, /^alpine-virt-3\.24\.1-x86\.iso$/);
assert.equal(ALPINE_ARTIFACT.version, '3.24.1');
assert.match(ALPINE_ARTIFACT.sha256, /REPLACE_WITH_TRUSTED_RELEASE_SHA256/);

console.log('VNext correctness checks passed');
