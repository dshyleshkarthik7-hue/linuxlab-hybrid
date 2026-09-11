export type TelemetrySource = 'REAL' | 'SIMULATED';

export type ProcessTelemetry = {
  pid: number;
  ppid: number;
  user: string;
  state: string;
  cpuPercent: number;
  memoryBytes: number;
  command: string;
};

export type SystemTelemetry = {
  source: TelemetrySource;
  kernel: string;
  architecture: string;
  cpuPercent: number;
  memoryBytes: number;
  diskBytes: number;
  uptimeSeconds: number;
  loadAverage: number;
};

/** Explicitly labelled simulator telemetry. It never claims browser-generated values are host measurements. */
export class LinuxObservatory {
  private readonly source: TelemetrySource;
  private readonly startedAt = Date.now();
  private nextPid = 100;
  private processes = new Map<number, ProcessTelemetry>();

  constructor(source: TelemetrySource = 'SIMULATED') {
    this.source = source;
    this.processes.set(1, { pid: 1, ppid: 0, user: 'root', state: 'S', cpuPercent: 0, memoryBytes: 4 * 1024 * 1024, command: 'init' });
    this.processes.set(2, { pid: 2, ppid: 1, user: 'root', state: 'S', cpuPercent: 0, memoryBytes: 2 * 1024 * 1024, command: 'shell' });
  }

  spawn(command: string, ppid = 2): ProcessTelemetry {
    const process: ProcessTelemetry = { pid: this.nextPid++, ppid, user: 'root', state: 'R', cpuPercent: 0, memoryBytes: 1024 * 1024, command };
    this.processes.set(process.pid, process);
    return { ...process };
  }

  exit(pid: number): boolean { return this.processes.delete(pid); }

  processTree(): ProcessTelemetry[] { return [...this.processes.values()].map(p => ({ ...p })); }

  system(): SystemTelemetry {
    return {
      source: this.source,
      kernel: this.source === 'REAL' ? 'unknown' : 'LinuxLab educational model',
      architecture: 'x86_64',
      cpuPercent: this.source === 'REAL' ? 0 : 3,
      memoryBytes: this.source === 'REAL' ? 0 : 48 * 1024 * 1024,
      diskBytes: this.source === 'REAL' ? 0 : 128 * 1024 * 1024,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      loadAverage: this.source === 'REAL' ? 0 : 0.03,
    };
  }

  label(): string { return this.source === 'REAL' ? '● REAL TELEMETRY' : '● SIMULATED TELEMETRY'; }
}
