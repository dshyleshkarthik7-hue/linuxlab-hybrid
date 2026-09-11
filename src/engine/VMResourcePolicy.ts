export interface VMResourcePolicy {
  memoryMiB: number;
  vgaMemoryMiB: number;
  bootTimeoutMs: number;
  maxSessionMs: number;
  maxSerialBytes: number;
}

export const VM_RESOURCE_POLICIES = {
  developer: { memoryMiB: 1024, vgaMemoryMiB: 8, bootTimeoutMs: 5 * 60_000, maxSessionMs: 60 * 60_000, maxSerialBytes: 16_000 },
  virt: { memoryMiB: 512, vgaMemoryMiB: 8, bootTimeoutMs: 4 * 60_000, maxSessionMs: 45 * 60_000, maxSerialBytes: 16_000 },
  linux4: { memoryMiB: 256, vgaMemoryMiB: 4, bootTimeoutMs: 3 * 60_000, maxSessionMs: 30 * 60_000, maxSerialBytes: 16_000 },
} as const satisfies Record<string, VMResourcePolicy>;

export function boundedSerial(previous: string, next: string, maxBytes: number): string {
  return (previous + next).slice(-maxBytes);
}
