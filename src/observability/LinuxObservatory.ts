export type TelemetrySource = 'REAL' | 'SIMULATED';

export type ProcessTelemetry = { pid: number; ppid: number; user: string; state: string; cpuPercent: number; memoryBytes: number; command: string; };
export type GuestSystemTelemetry = { kernel: string; architecture: string; cpuPercent: number; memoryBytes: number; diskBytes: number; uptimeSeconds: number; loadAverage: number; };
export type SystemTelemetry = GuestSystemTelemetry & { source: TelemetrySource };

/** Guest telemetry model. REAL values are accepted only from an explicit guest provider/snapshot. */
export class LinuxObservatory {
  private readonly source: TelemetrySource;
  private readonly startedAt = Date.now();
  private nextPid = 100;
  private processes = new Map<number, ProcessTelemetry>();
  private guest: GuestSystemTelemetry | null = null;

  constructor(source: TelemetrySource = 'SIMULATED') {
    this.source = source;
    this.processes.set(1, { pid: 1, ppid: 0, user: 'root', state: 'S', cpuPercent: 0, memoryBytes: 4 * 1024 * 1024, command: 'init' });
    this.processes.set(2, { pid: 2, ppid: 1, user: 'root', state: 'S', cpuPercent: 0, memoryBytes: 2 * 1024 * 1024, command: 'shell' });
  }

  setGuestTelemetry(snapshot: GuestSystemTelemetry): void {
    if (this.source !== 'REAL') return;
    if (!snapshot.kernel || !snapshot.architecture || !Number.isFinite(snapshot.uptimeSeconds)) throw new Error('invalid guest telemetry snapshot');
    this.guest = { ...snapshot };
  }

  clearGuestTelemetry(): void { this.guest = null; }
  hasGuestTelemetry(): boolean { return this.guest !== null; }

  spawn(command: string, ppid = 2): ProcessTelemetry {
    const process: ProcessTelemetry = { pid: this.nextPid++, ppid, user: 'root', state: 'R', cpuPercent: 0, memoryBytes: 1024 * 1024, command };
    this.processes.set(process.pid, process);
    return { ...process };
  }
  exit(pid: number): boolean { return this.processes.delete(pid); }
  processTree(): ProcessTelemetry[] { return [...this.processes.values()].map(p => ({ ...p })); }

  system(): SystemTelemetry {
    if (this.source === 'REAL') {
      if (!this.guest) throw new Error('REAL telemetry unavailable until a verified guest snapshot is provided');
      return { source: 'REAL', ...this.guest };
    }
    return { source: 'SIMULATED', kernel: 'LinuxLab educational model', architecture: 'x86_64', cpuPercent: 3, memoryBytes: 48 * 1024 * 1024, diskBytes: 128 * 1024 * 1024, uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000), loadAverage: 0.03 };
  }

  label(): string { return this.source === 'REAL' ? (this.guest ? '● REAL TELEMETRY' : '● REAL TELEMETRY • WAITING FOR GUEST') : '● SIMULATED TELEMETRY'; }
}
