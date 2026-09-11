import { strict as assert } from 'node:assert';
import { StructuredLinuxEngine } from '../src/engine/StructuredLinuxEngine.ts';

const engine = new StructuredLinuxEngine();
for (const input of [':() { : | : & }; :', 'while true; do :; done', 'fork()', 'system(x)', 'popen(x)']) {
  const result = await engine.executeResult(input);
  assert.ok(result.exitCode !== 0, `adversarial input must be rejected: ${input}`);
}
const oversized = await engine.executeResult('echo ' + 'x'.repeat(64_001));
assert.equal(oversized.exitCode, 2);
assert.match(oversized.stderr, /input limit/);
const deep = Array.from({ length: 70 }, () => 'true').join(' && ');
const deepResult = await engine.executeResult(deep);
assert.notEqual(deepResult.exitCode, 0);
console.log('Adversarial resource checks passed');
