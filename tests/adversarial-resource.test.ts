import { strict as assert } from 'node:assert';
import { StructuredLinuxEngine } from '../src/engine/StructuredLinuxEngine.ts';

const engine = new StructuredLinuxEngine();

for (const input of [
  ':() { : | : & }; :',
  'while true; do :; done',
  'while :; do echo loop; done',
  'fork()',
  'exec(system(x))',
  'system(x)',
  'popen(x)',
]) {
  const result = await engine.executeResult(input);
  assert.notEqual(result.exitCode, 0, `adversarial input must be rejected: ${input}`);
}

for (const input of [
  'echo "unterminated',
  "echo 'unterminated",
  'echo a |',
  '&& echo bad',
  'echo a >',
  'cat <',
]) {
  const result = await engine.executeResult(input);
  assert.notEqual(result.exitCode, 0, `malformed input must fail: ${input}`);
}

const oversized = await engine.executeResult('echo ' + 'x'.repeat(64_001));
assert.equal(oversized.exitCode, 2);
assert.match(oversized.stderr, /input limit/);

const deep = Array.from({ length: 70 }, () => 'true').join(' && ');
const deepResult = await engine.executeResult(deep);
assert.notEqual(deepResult.exitCode, 0, 'deep command nesting must be bounded');

const pipeline = Array.from({ length: 40 }, () => 'printf x').join(' | ');
const pipelineResult = await engine.executeResult(pipeline);
assert.notEqual(pipelineResult.exitCode, 0, 'pipeline fan-out must be bounded');

const hugeOutput = await engine.executeResult(`printf ${'x'.repeat(20_000)}`);
assert.ok(hugeOutput.stdout.length <= 16_384, 'command output must be bounded');

console.log('Adversarial resource checks passed');
