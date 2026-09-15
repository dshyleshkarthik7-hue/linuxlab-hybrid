import { strict as assert } from 'node:assert';
import { StructuredLinuxEngine } from '../src/engine/StructuredLinuxEngine.ts';
import { VM_RESOURCE_POLICIES } from '../src/engine/VMResourcePolicy.ts';

const engine = new StructuredLinuxEngine();
const policy = VM_RESOURCE_POLICIES.linux4;

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

// Exercise the configured runtime boundary instead of assuming a smaller
// test-only limit. The input is deliberately larger than the linux4 policy.
const hugeOutput = await engine.executeResult(`printf ${'x'.repeat(policy.maxOutputBytes + 1024)}`);
const outputBytes = new TextEncoder().encode(hugeOutput.stdout).byteLength;
assert.ok(outputBytes <= policy.maxOutputBytes, 'command output must be bounded');
assert.equal(hugeOutput.truncated, true, 'oversized command output must be marked truncated');

console.log('Adversarial resource checks passed');
