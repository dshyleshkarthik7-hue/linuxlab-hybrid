import { strict as assert } from 'node:assert';
import { VM_RESOURCE_POLICIES, VMRuntimeResourceEnforcer, boundedText } from '../src/engine/VMResourcePolicy.ts';

for (const [name, policy] of Object.entries(VM_RESOURCE_POLICIES)) {
  const enforcer = new VMRuntimeResourceEnforcer(policy, 1_000);
  assert.equal(enforcer.memoryBytes, policy.memoryMiB * 1024 * 1024, `${name}: memory`);
  assert.equal(enforcer.vgaMemoryBytes, policy.vgaMemoryMiB * 1024 * 1024, `${name}: VGA memory`);
  assert.equal(enforcer.commandTimeoutMs, policy.maxCommandMs, `${name}: command timeout`);
  assert.equal(enforcer.sessionExpired(1_000 + policy.maxSessionMs - 1), false, `${name}: session before expiry`);
  assert.equal(enforcer.sessionExpired(1_000 + policy.maxSessionMs), true, `${name}: session expiry`);
  assert.equal(enforcer.acceptSerialByte(policy.maxSerialBytes), true, `${name}: serial quota`);
  assert.equal(enforcer.acceptSerialByte(1), false, `${name}: serial overflow`);
  const bounded = enforcer.acceptOutput('x'.repeat(policy.maxOutputBytes));
  assert.equal(bounded.truncated, false, `${name}: output quota`);
  assert.equal(enforcer.state.outputBytes, policy.maxOutputBytes, `${name}: output accounting`);
  assert.deepEqual(enforcer.acceptOutput('x'), { value: '', truncated: true }, `${name}: output overflow`);
  assert.equal(policy.maxProcesses > 0, true, `${name}: process policy`);
  assert.equal(policy.cpuSeconds > 0, true, `${name}: CPU policy`);
  assert.equal(policy.maxFilesystemBytes >= policy.maxFileBytes, true, `${name}: aggregate filesystem quota`);
  assert.equal(policy.networkAllowed, false, `${name}: network isolation`);
  enforcer.stop();
  assert.equal(enforcer.isStopped(), true, `${name}: stop`);
}

// 🙂 is four bytes in UTF-8. A seven-byte quota therefore permits exactly one
// complete emoji; the truncator must never split a multi-byte code point.
assert.equal(boundedText('🙂'.repeat(100), 7).value, '🙂');
assert.equal(new TextEncoder().encode(boundedText('🙂'.repeat(100), 7).value).byteLength, 4);
assert.equal(boundedText('🙂'.repeat(100), 7).truncated, true);
console.log('VM resource policy enforcement checks passed');
