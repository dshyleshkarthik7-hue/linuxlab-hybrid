export interface VMResourcePolicy {
  memoryMiB: number;
  vgaMemoryMiB: number;
  bootTimeoutMs: number;
  maxSessionMs: number;
  maxSerialBytes: number;
  maxCommandMs: number;
  maxOutputBytes: number;
  maxFileBytes: number;
  maxPipelineStages: number;
  maxProcesses: number;
  networkAllowed: boolean;
}

export const VM_RESOURCE_POLICIES = {
  developer: { memoryMiB: 1024, vgaMemoryMiB: 8, bootTimeoutMs: 5 * 60_000, maxSessionMs: 60 * 60_000, maxSerialBytes: 16_000, maxCommandMs: 30_000, maxOutputBytes: 1_000_000, maxFileBytes: 8_000_000, maxPipelineStages: 16, maxProcesses: 128, networkAllowed: false },
  virt: { memoryMiB: 512, vgaMemoryMiB: 8, bootTimeoutMs: 4 * 60_000, maxSessionMs: 45 * 60_000, maxSerialBytes: 16_000, maxCommandMs: 30_000, maxOutputBytes: 1_000_000, maxFileBytes: 8_000_000, maxPipelineStages: 16, maxProcesses: 64, networkAllowed: false },
  linux4: { memoryMiB: 256, vgaMemoryMiB: 4, bootTimeoutMs: 3 * 60_000, maxSessionMs: 30 * 60_000, maxSerialBytes: 16_000, maxCommandMs: 15_000, maxOutputBytes: 512_000, maxFileBytes: 4_000_000, maxPipelineStages: 8, maxProcesses: 32, networkAllowed: false },
} as const satisfies Record<string, VMResourcePolicy>;

function utf8Prefix(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= maxBytes) return value;
  let end = maxBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
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
