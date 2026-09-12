export interface VMResourcePolicy {
  memoryMiB: number;
  vgaMemoryMiB: number;
  bootTimeoutMs: number;
  maxSessionMs: number;
  maxSerialBytes: number;
  maxCommandMs: number;
  maxOutputBytes: number;
  maxFileBytes: number;
  maxFilesystemBytes: number;
  maxPipelineStages: number;
  maxProcesses: number;
  cpuSeconds: number;
  networkAllowed: boolean;
}

export const VM_RESOURCE_POLICIES = {
  developer: { memoryMiB: 1024, vgaMemoryMiB: 8, bootTimeoutMs: 5 * 60_000, maxSessionMs: 60 * 60_000, maxSerialBytes: 16_000, maxCommandMs: 30_000, maxOutputBytes: 1_000_000, maxFileBytes: 8_000_000, maxFilesystemBytes: 128_000_000, maxPipelineStages: 16, maxProcesses: 128, cpuSeconds: 30, networkAllowed: false },
  virt: { memoryMiB: 512, vgaMemoryMiB: 8, bootTimeoutMs: 4 * 60_000, maxSessionMs: 45 * 60_000, maxSerialBytes: 16_000, maxCommandMs: 30_000, maxOutputBytes: 1_000_000, maxFileBytes: 8_000_000, maxFilesystemBytes: 96_000_000, maxPipelineStages: 16, maxProcesses: 64, cpuSeconds: 30, networkAllowed: false },
  linux4: { memoryMiB: 256, vgaMemoryMiB: 4, bootTimeoutMs: 3 * 60_000, maxSessionMs: 30 * 60_000, maxSerialBytes: 16_000, maxCommandMs: 15_000, maxOutputBytes: 512_000, maxFileBytes: 4_000_000, maxFilesystemBytes: 32_000_000, maxPipelineStages: 8, maxProcesses: 32, cpuSeconds: 15, networkAllowed: false },
} as const satisfies Record<string, VMResourcePolicy>;

export type VMResourcePolicyName = keyof typeof VM_RESOURCE_POLICIES;

export interface VMRuntimeBoundaryState {
  startedAt: number;
  serialBytes: number;
  outputBytes: number;
  stopped: boolean;
}

export class VMRuntimeResourceEnforcer {
  readonly policy: VMResourcePolicy;
  readonly state: VMRuntimeBoundaryState;

  constructor(policy: VMResourcePolicy, startedAt = Date.now()) {
    this.policy = policy;
    this.state = { startedAt, serialBytes: 0, outputBytes: 0, stopped: false };
  }

  get memoryBytes(): number { return this.policy.memoryMiB * 1024 * 1024; }
  get vgaMemoryBytes(): number { return this.policy.vgaMemoryMiB * 1024 * 1024; }
  get commandTimeoutMs(): number { return this.policy.maxCommandMs; }

  sessionExpired(now = Date.now()): boolean {
    return now - this.state.startedAt >= this.policy.maxSessionMs;
  }

  remainingSessionMs(now = Date.now()): number {
    return Math.max(0, this.policy.maxSessionMs - (now - this.state.startedAt));
  }

  acceptSerialByte(byteCount = 1): boolean {
    if (byteCount < 0 || !Number.isFinite(byteCount)) return false;
    if (this.state.serialBytes + byteCount > this.policy.maxSerialBytes) return false;
    this.state.serialBytes += byteCount;
    return true;
  }

  acceptOutput(value: string): { value: string; truncated: boolean } {
    const remaining = Math.max(0, this.policy.maxOutputBytes - this.state.outputBytes);
    const bounded = boundedText(value, remaining);
    this.state.outputBytes += new TextEncoder().encode(bounded.value).byteLength;
    return bounded;
  }

  stop(): void { this.state.stopped = true; }
  isStopped(): boolean { return this.state.stopped; }
}

function utf8Prefix(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= maxBytes) return value;
  let end = Math.min(maxBytes, bytes.byteLength);
  // `end` is an exclusive slice boundary. A UTF-8 continuation byte at
  // bytes[end] means the boundary falls inside the following code point.
  while (end > 0 && end < bytes.byteLength && (bytes[end] & 0xc0) === 0x80) end--;
  return new TextDecoder().decode(bytes.slice(0, end));
}

export function boundedSerial(previous: string, next: string, maxBytes: number): string {
  return utf8Prefix(previous + next, maxBytes);
}

export function boundedText(value: string, maxBytes: number): { value: string; truncated: boolean } {
  const encoded = new TextEncoder().encode(value);
  if (encoded.byteLength <= maxBytes) return { value, truncated: false };
  return { value: utf8Prefix(value, maxBytes), truncated: true };
}
