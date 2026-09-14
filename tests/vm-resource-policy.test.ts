import assert from 'node:assert/strict';
import { VM_RESOURCE_POLICIES, VMRuntimeResourceEnforcer, guestObservedLimits, hostEnforcedLimits } from '../src/engine/VMResourcePolicy.ts';

for (const policy of Object.values(VM_RESOURCE_POLICIES)) {
  const enforcer = new VMRuntimeResourceEnforcer(policy, 1_000);
  assert.equal(enforcer.memoryBytes, policy.memoryMiB * 1024 * 1024);
  assert.equal(enforcer.vgaMemoryBytes, policy.vgaMemoryMiB * 1024 * 1024);
  assert.equal(enforcer.remainingSessionMs(1_000), policy.maxSessionMs);
  assert.equal(enforcer.hasFreshTelemetry(1_000), false);
  assert.equal(enforcer.acceptSerialByte(policy.maxSerialBytes), true);
  assert.equal(enforcer.acceptSerialByte(1), false);
  const output = enforcer.acceptOutput('x'.repeat(policy.maxOutputBytes + 10));
  assert.equal(output.truncated, true);
  assert.equal(new TextEncoder().encode(output.value).byteLength, policy.maxOutputBytes);

  const sampleAt = 10_000;
  assert.equal(enforcer.observeGuest({ memoryBytes: policy.memoryMiB * 1024 * 1024, sampledAt: sampleAt }, sampleAt), true);
  assert.equal(enforcer.hasFreshTelemetry(sampleAt + policy.telemetryMaxAgeMs), true);
  assert.equal(enforcer.hasFreshTelemetry(sampleAt + policy.telemetryMaxAgeMs + 1), false);
  assert.equal(enforcer.observeGuest({ memoryBytes: policy.memoryMiB * 1024 * 1024, sampledAt: sampleAt }, sampleAt + 1), false);
  assert.equal(enforcer.observeGuest({ memoryBytes: policy.memoryMiB * 1024 * 1024, sampledAt: sampleAt - 1 }, sampleAt + 1), false);
  assert.equal(enforcer.observeGuest({ memoryBytes: policy.memoryMiB * 1024 * 1024, sampledAt: sampleAt + 2_000 }, sampleAt + 1), false);
  assert.equal(enforcer.observeGuest({ memoryBytes: policy.memoryMiB * 1024 * 1024, sampledAt: sampleAt - policy.telemetryMaxAgeMs - 2 }, sampleAt), false);
  assert.equal(enforcer.observeGuest({ memoryBytes: policy.memoryMiB * 1024 * 1024 + 1, sampledAt: sampleAt + 1 }, sampleAt + 1), false);

  const limits = new VMRuntimeResourceEnforcer(policy, 1_000);
  assert.equal(limits.observeGuest({ processCount: policy.maxProcesses, sampledAt: sampleAt }, sampleAt), true);
  assert.equal(limits.observeGuest({ processCount: policy.maxProcesses + 1, sampledAt: sampleAt + 1 }, sampleAt + 1), false);
  const filesystem = new VMRuntimeResourceEnforcer(policy, 1_000);
  assert.equal(filesystem.observeGuest({ filesystemBytes: policy.maxFilesystemBytes, sampledAt: sampleAt }, sampleAt), true);
  assert.equal(filesystem.observeGuest({ filesystemBytes: policy.maxFilesystemBytes + 1, sampledAt: sampleAt + 1 }, sampleAt + 1), false);
  const cpu = new VMRuntimeResourceEnforcer(policy, 1_000);
  assert.equal(cpu.observeGuest({ cpuSeconds: policy.cpuSeconds, sampledAt: sampleAt }, sampleAt), true);
  assert.equal(cpu.observeGuest({ cpuSeconds: policy.cpuSeconds + 1, sampledAt: sampleAt + 1 }, sampleAt + 1), false);

  assert.equal(enforcer.acceptPipeline('printf x | grep x | wc -c'), true);
  assert.equal(enforcer.acceptPipeline(Array.from({ length: policy.maxPipelineStages + 1 }, () => 'true').join(' | ')), false);
}

assert.deepEqual(guestObservedLimits, ['cpuSeconds', 'processCount', 'filesystemBytes', 'memoryBytes']);
assert.ok(hostEnforcedLimits.includes('vmMemoryAllocation'));
assert.ok(hostEnforcedLimits.includes('networkDisabled'));

console.log('VM resource policy enforcement checks passed');
