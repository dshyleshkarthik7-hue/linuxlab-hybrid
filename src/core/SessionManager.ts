export type SessionState = 'IDLE' | 'STARTING' | 'READY' | 'RUNNING' | 'STOPPING' | 'STOPPED';

export type SessionLimits = {
  cpuMs: number;
  memoryBytes: number;
  diskBytes: number;
  processCount: number;
  timeoutMs: number;
};

export const DEFAULT_SESSION_LIMITS: SessionLimits = {
  cpuMs: 30_000,
  memoryBytes: 256 * 1024 * 1024,
  diskBytes: 128 * 1024 * 1024,
  processCount: 128,
  timeoutMs: 30 * 60 * 1000,
};

type StopFn = () => Promise<void>;

/** Browser-side lifecycle guard. The real VM adapter must supply actual start/stop work. */
export class SessionManager {
  private state: SessionState = 'IDLE';
  private busy = false;
  private startedAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly limits: SessionLimits;
  private readonly stopFn: StopFn | undefined;

  constructor(limits: SessionLimits = DEFAULT_SESSION_LIMITS, stopFn?: StopFn) {
    this.limits = limits;
    this.stopFn = stopFn;
  }

  getState(): SessionState { return this.state; }
  getLimits(): SessionLimits { return { ...this.limits }; }

  async start(startFn: () => Promise<void>): Promise<void> {
    if (this.busy || !['IDLE', 'STOPPED'].includes(this.state)) return;
    this.busy = true;
    this.state = 'STARTING';
    try {
      await startFn();
      this.state = 'READY';
      this.startedAt = Date.now();
      this.armTimeout();
    } catch (error) {
      this.state = 'STOPPED';
      throw error;
    } finally {
      this.busy = false;
    }
  }

  async execute(executeFn: () => Promise<void>): Promise<void> {
    if (this.state !== 'READY' && this.state !== 'RUNNING') throw new Error(`Session is ${this.state}`);
    this.state = 'RUNNING';
    try {
      await executeFn();
    } finally {
      if (this.state === 'RUNNING') this.state = 'READY';
    }
  }

  async stop(stopFn: StopFn = this.stopFn ?? (async () => {})): Promise<void> {
    if (this.busy || !['READY', 'RUNNING'].includes(this.state)) return;
    this.busy = true;
    this.state = 'STOPPING';
    try {
      await stopFn();
    } finally {
      this.clearTimeout();
      this.state = 'STOPPED';
      this.busy = false;
    }
  }

  async restart(startFn: () => Promise<void>, stopFn: StopFn = this.stopFn ?? (async () => {})): Promise<void> {
    await this.stop(stopFn);
    await this.start(startFn);
  }

  /** Stop the active adapter before marking a timed-out session stopped. */
  async destroy(): Promise<void> {
    this.clearTimeout();
    if (this.busy) return;
    this.busy = true;
    const stopFn = this.stopFn;
    try {
      if (stopFn && ['READY', 'RUNNING'].includes(this.state)) {
        this.state = 'STOPPING';
        await stopFn();
      }
    } finally {
      this.state = 'STOPPED';
      this.busy = false;
    }
  }

  private armTimeout(): void {
    this.clearTimeout();
    this.timer = setTimeout(() => {
      void this.destroy();
    }, this.limits.timeoutMs);
  }

  private clearTimeout(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
