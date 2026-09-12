import { strict as assert } from 'node:assert';
import { VM_RESOURCE_POLICIES, VMRuntimeResourceEnforcer, boundedText } from '../src/engine/VMResourcePolicy.ts';

for (const policy of Object.values(VM_RESOURCE_POLICIES)) {
  const enforcer = new VMRuntimeResourceEnforcer(policy, 0);
  assert.equal(enforcer.memoryBytes, policy.memoryMiB * 1024 * 1024);
  assert.equal(enforcer.vgaMemoryBytes, policy.vgaMemoryMiB * 1024 * 1024);
  assert.equal(enforcer.sessionExpired(policy.maxSessionMs), true);
  assert.equal(enforcer.acceptSerialByte(policy.maxSerialBytes), true);
  assert.equal(enforcer.acceptSerialByte(1), false);
}
const bounded = boundedText('😀😀😀', 5);
assert.equal(bounded.truncated, true);
assert.equal(bounded.value, '😀');
console.log('VM resource policy checks passed');
