import { strict as assert } from 'node:assert';
import { InBrowserLinuxEngine } from '../src/engine/LinuxEngine.ts';

const engine = new InBrowserLinuxEngine();

for (const input of [
  ':() { : | : & }; :',
  'while true; do :; done',
  'fork()',
  'system(x)',
  'popen(x)',
]) {
  const result = await engine.execute(input);
  assert.notEqual(result, '', `adversarial input must be rejected or produce a diagnostic: ${input}`);
}

const oversized = await engine.execute('echo ' + 'x'.repeat(64_001));
assert.ok(oversized.length > 0, 'oversized input must not silently disappear');

const deep = Array.from({ length: 70 }, () => 'true').join(' && ');
const deepResult = await engine.execute(deep);
assert.equal(typeof deepResult, 'string');

console.log('Adversarial resource checks passed');
