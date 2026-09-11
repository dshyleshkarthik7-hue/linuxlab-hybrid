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

export class SessionManager {
  private state: SessionState = 'IDLE';
  private busy = false;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly limits: SessionLimits;
  private readonly stopFn: StopFn | undefined;

  constructor(limits: SessionLimits = DEFAULT_SESSION_LIMITS, stopFn?: StopFn) {
    this.limits = { ...limits };
    this.stopFn = stopFn;
  }

  getState(): SessionState { return this.state; }
  getLimits(): SessionLimits { return { ...this.limits }; }

  async start(startFn: () => Promise<void>): Promise<void> {
    if (this.busy || !['IDLE', 'STOPPED'].includes(this.state)) return;
    const generation = ++this.generation;
    this.busy = true;
    this.state = 'STARTING';
    try {
      await startFn();
      if (generation !== this.generation) return;
      this.state = 'READY';
      this.armTimeout(generation);
    } catch (error) {
      if (generation === this.generation) {
        this.clearTimeout();
        this.state = 'STOPPED';
      }
      throw error;
    } finally {
      if (generation === this.generation) this.busy = false;
    }
  }

  async execute(executeFn: () => Promise<void>): Promise<void> {
    if (this.state !== 'READY') throw new Error(`Session is ${this.state}`);
    const generation = this.generation;
    this.state = 'RUNNING';
    try {
      await Promise.race([executeFn(), this.delay(this.limits.cpuMs).then(() => { throw new Error('command CPU time limit exceeded'); })]);
    } finally {
      if (generation === this.generation && this.state === 'RUNNING') this.state = 'READY';
    }
  }

  async stop(stopFn: StopFn = this.stopFn ?? (async () => {})): Promise<void> {
    if (this.busy || !['READY', 'RUNNING'].includes(this.state)) return;
    ++this.generation;
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

  async destroy(): Promise<void> {
    if (this.busy) return;
    ++this.generation;
    this.clearTimeout();
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

  private armTimeout(generation: number): void {
    this.clearTimeout();
    this.timer = setTimeout(() => {
      if (generation === this.generation) void this.destroy();
    }, this.limits.timeoutMs);
  }

  private clearTimeout(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
