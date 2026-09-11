import { strict as assert } from 'node:assert';
import { ShellParser } from '../src/engine/ShellParser.ts';
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
const session = new SessionManager({ cpuMs: 1, memoryBytes: 1, diskBytes: 1, processCount: 1, timeoutMs: 10 }, async () => { stopped++; });
await session.start(async () => {});
await new Promise(resolve => setTimeout(resolve, 30));
assert.equal(session.getState(), 'STOPPED');
assert.equal(stopped, 1);

// verifyArtifact is async, so the rejection must be asserted asynchronously.
await assert.rejects(
  () => verifyArtifact(new ArrayBuffer(0), ALPINE_ARTIFACT),
  /no trusted SHA-256 digest configured/,
);

console.log('VNext correctness checks passed');
