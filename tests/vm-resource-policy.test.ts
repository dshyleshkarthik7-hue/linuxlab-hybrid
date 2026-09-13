import assert from 'node:assert/strict';
import { VM_RESOURCE_POLICIES, VMRuntimeResourceEnforcer } from '../src/engine/VMResourcePolicy.ts';

for (const policy of Object.values(VM_RESOURCE_POLICIES)) {
  const enforcer = new VMRuntimeResourceEnforcer(policy, 1_000);
  assert.equal(enforcer.memoryBytes, policy.memoryMiB * 1024 * 1024);
  assert.equal(enforcer.vgaMemoryBytes, policy.vgaMemoryMiB * 1024 * 1024);
  assert.equal(enforcer.remainingSessionMs(1_000), policy.maxSessionMs);
  assert.equal(enforcer.acceptSerialByte(policy.maxSerialBytes), true);
  assert.equal(enforcer.acceptSerialByte(1), false);
  const output = enforcer.acceptOutput('x'.repeat(policy.maxOutputBytes + 10));
  assert.equal(output.truncated, true);
  assert.equal(new TextEncoder().encode(output.value).byteLength, policy.maxOutputBytes);
  assert.equal(enforcer.observeGuest({ memoryBytes: policy.memoryMiB * 1024 * 1024 }), true);
  assert.equal(enforcer.observeGuest({ memoryBytes: policy.memoryMiB * 1024 * 1024 + 1 }), false);
  assert.equal(enforcer.observeGuest({ processCount: policy.maxProcesses }), true);
  assert.equal(enforcer.observeGuest({ processCount: policy.maxProcesses + 1 }), false);
  assert.equal(enforcer.observeGuest({ filesystemBytes: policy.maxFilesystemBytes }), true);
  assert.equal(enforcer.observeGuest({ filesystemBytes: policy.maxFilesystemBytes + 1 }), false);
  assert.equal(enforcer.observeGuest({ cpuSeconds: policy.cpuSeconds }), true);
  assert.equal(enforcer.observeGuest({ cpuSeconds: policy.cpuSeconds + 1 }), false);
  assert.equal(enforcer.acceptPipeline('printf x | grep x | wc -c'), true);
  assert.equal(enforcer.acceptPipeline(Array.from({ length: policy.maxPipelineStages + 1 }, () => 'true').join(' | ')), false);
}

console.log('VM resource policy enforcement checks passed');
