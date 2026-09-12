export interface GuestTelemetrySnapshot {
  kernel: string;
  architecture: string;
  cpuPercent: number;
  memoryBytes: number;
  diskBytes: number;
  uptimeSeconds: number;
  loadAverage: number;
}

/** Parses a marked /proc + uname snapshot emitted by the real guest. */
export class GuestTelemetryBridge {
  private buffer = '';
  private snapshot: GuestTelemetrySnapshot | null = null;
  private previousCpu: { total: number; idle: number } | null = null;

  feed(text: string): GuestTelemetrySnapshot | null {
    this.buffer = (this.buffer + text).slice(-16000);
    const start = this.buffer.lastIndexOf('__LT_TELEMETRY__');
    const end = this.buffer.lastIndexOf('__LT_END__');
    if (start < 0 || end <= start) return null;
    const block = this.buffer.slice(start, end).split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(1);
    const uname = block.find(line => /^Linux\s+/.test(line));
    const cpu = block.find(line => /^cpu\s+\d+\s+\d+\s+\d+\s+\d+/.test(line));
    const uptime = block.find(line => /^\d+(?:\.\d+)?\s+\d+/.test(line));
    const load = block.find(line => /^\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?/.test(line));
    const total = block.find(line => /^MemTotal:\s+\d+\s+kB/.test(line));
    const available = block.find(line => /^MemAvailable:\s+\d+\s+kB/.test(line));
    const disk = block.find(line => /^\/\S+\s+\d+\s+\d+\s+\d+\s+\d+%\s+\/$/.test(line));
    if (!uname || !cpu || !uptime || !load || !total || !available || !disk) return null;
    const unameParts = uname.split(/\s+/);
    const cpuValues = cpu.split(/\s+/).slice(1).map(Number);
    const idle = (cpuValues[3] || 0) + (cpuValues[4] || 0);
    const totalTicks = cpuValues.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
    let cpuPercent = 0;
    if (this.previousCpu) {
      const totalDelta = totalTicks - this.previousCpu.total;
      const idleDelta = idle - this.previousCpu.idle;
      cpuPercent = totalDelta > 0 ? Math.max(0, Math.min(100, 100 * (1 - idleDelta / totalDelta))) : 0;
    }
    this.previousCpu = { total: totalTicks, idle };
    const totalBytes = Number(total.match(/\d+/)?.[0] ?? 0) * 1024;
    const availableBytes = Number(available.match(/\d+/)?.[0] ?? 0) * 1024;
    const diskBytes = Number(disk.split(/\s+/)[1] ?? 0) * 1024;
    const snapshot: GuestTelemetrySnapshot = {
      kernel: unameParts[1] || 'unknown',
      architecture: unameParts[2] || 'unknown',
      cpuPercent,
      memoryBytes: Math.max(0, totalBytes - availableBytes),
      diskBytes: Math.max(0, diskBytes),
      uptimeSeconds: Number(uptime.split(/\s+/)[0] || 0),
      loadAverage: Number(load.split(/\s+/)[0] || 0),
    };
    this.snapshot = snapshot;
    this.buffer = this.buffer.slice(end + '__LT_END__'.length);
    return { ...snapshot };
  }

  latest(): GuestTelemetrySnapshot | null { return this.snapshot ? { ...this.snapshot } : null; }
}
