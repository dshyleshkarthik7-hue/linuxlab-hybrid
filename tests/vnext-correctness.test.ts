import { strict as assert } from 'node:assert';
import { ShellParser } from '../src/engine/ShellParser.ts';
import { summarizeAssessment } from '../src/engine/AssessmentTypes.ts';
import { LinuxObservatory } from '../src/observability/LinuxObservatory.ts';

const parser = new ShellParser();
assert.equal(parser.parse('echo "a && b"').type, 'command');
assert.equal(parser.parse("echo 'a | b'").type, 'command');
assert.throws(() => parser.parse('echo "unterminated'), /Unterminated quote/);
assert.throws(() => parser.parse('echo foo ||'), /Expected command/);
assert.throws(() => parser.parse('echo | bar'), /Expected command/);

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

console.log('VNext correctness checks passed');
