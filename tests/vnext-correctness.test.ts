import { strict as assert } from 'node:assert';
import { InBrowserLinuxEngine } from '../src/engine/LinuxEngine.ts';
import { summarizeAssessment } from '../src/engine/AssessmentTypes.ts';
import { LinuxObservatory } from '../src/observability/LinuxObservatory.ts';
import { SessionManager } from '../src/core/SessionManager.ts';
import { ALPINE_ARTIFACT, verifyArtifact } from '../src/core/ISOIntegrity.ts';

const engine = new InBrowserLinuxEngine();
assert.equal(await engine.execute('echo "a && b"'), 'a && b');
assert.equal(await engine.execute("echo 'a | b'"), 'a | b');
assert.equal(await engine.execute('echo saved > /root/p0.txt && cat /root/p0.txt'), 'saved');
assert.equal(await engine.execute('printf hello | wc -c'), '5');
assert.equal(await engine.execute('false && echo no'), '');
assert.equal(await engine.execute('false || echo recovered'), 'recovered');

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
const session = new SessionManager(
  { cpuMs: 50, memoryBytes: 1, diskBytes: 1, processCount: 1, timeoutMs: 10 },
  async () => { stopped++; },
);
await session.start(async () => {});
await new Promise(resolve => setTimeout(resolve, 30));
assert.equal(session.getState(), 'STOPPED');
assert.equal(stopped, 1);

assert.match(ALPINE_ARTIFACT.sha256, /^[a-f0-9]{64}$/i);
await assert.rejects(
  () => verifyArtifact(new ArrayBuffer(0), ALPINE_ARTIFACT),
  /unexpected size/,
);
const wrongDigestBytes = new TextEncoder().encode('linuxlab-vnext-integrity-fixture').buffer;
const wrongDigestArtifact = {
  ...ALPINE_ARTIFACT,
  sha256: '0'.repeat(64),
  size: wrongDigestBytes.byteLength,
};
await assert.rejects(
  () => verifyArtifact(wrongDigestBytes, wrongDigestArtifact),
  /failed SHA-256 integrity verification/,
);
assert.match(ALPINE_ARTIFACT.filename, /^alpine-virt-3\.24\.1-x86\.iso$/);
assert.equal(ALPINE_ARTIFACT.version, '3.24.1');

console.log('VNext correctness checks passed');
