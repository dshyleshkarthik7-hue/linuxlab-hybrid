export type SessionState = 'IDLE' | 'STARTING' | 'READY' | 'RUNNING' | 'STOPPING' | 'STOPPED';
export type SessionLimits = { cpuMs: number; memoryBytes: number; diskBytes: number; processCount: number; timeoutMs: number; };
export const DEFAULT_SESSION_LIMITS: SessionLimits = { cpuMs: 30_000, memoryBytes: 256 * 1024 * 1024, diskBytes: 128 * 1024 * 1024, processCount: 128, timeoutMs: 30 * 60 * 1000 };
type StopFn = () => Promise<void>;
type ExecuteFn = (signal: AbortSignal) => Promise<void>;

export class SessionManager {
  private state: SessionState = 'IDLE';
  private lifecycle: Promise<void> = Promise.resolve();
  private commandBusy = false;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private commandController: AbortController | undefined;
  private readonly limits: SessionLimits;
  private readonly stopFn: StopFn | undefined;

  constructor(limits: SessionLimits = DEFAULT_SESSION_LIMITS, stopFn?: StopFn) { this.limits = { ...limits }; this.stopFn = stopFn; }
  getState(): SessionState { return this.state; }
  getLimits(): SessionLimits { return { ...this.limits }; }

  start(startFn: () => Promise<void>): Promise<void> {
    return this.queueLifecycle(async () => {
      if (!['IDLE', 'STOPPED'].includes(this.state)) return;
      const generation = ++this.generation;
      this.state = 'STARTING';
      try { await startFn(); if (generation !== this.generation) return; this.state = 'READY'; this.armTimeout(generation); }
      catch (error) { if (generation === this.generation) { this.clearTimeout(); this.state = 'STOPPED'; } throw error; }
    });
  }

  async execute(executeFn: ExecuteFn): Promise<void> {
    if (this.state !== 'READY') throw new Error(`Session is ${this.state}`);
    if (this.commandBusy) throw new Error('Session command already running');
    const generation = this.generation;
    const controller = new AbortController();
    this.commandController = controller;
    this.commandBusy = true; this.state = 'RUNNING';
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let cleaned = false;
    const operation = Promise.resolve().then(() => executeFn(controller.signal));
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (timer) clearTimeout(timer);
      if (this.commandController === controller) this.commandController = undefined;
      this.commandBusy = false;
      if (generation === this.generation && this.state === 'RUNNING') this.state = 'READY';
    };
    try {
      await Promise.race([
        operation,
        new Promise<void>((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            controller.abort(new Error('command CPU time limit exceeded'));
            reject(new Error('command CPU time limit exceeded'));
          }, this.limits.cpuMs);
        }),
      ]);
      cleanup();
    } catch (error) {
      if (!timedOut) cleanup();
      else {
        // Do not permit a late operation to race a new command. The caller gets
        // the timeout immediately, while the operation remains fenced until it settles.
        void operation.then(cleanup, cleanup);
      }
      throw error;
    }
  }

  stop(stopFn: StopFn = this.stopFn ?? (async () => {})): Promise<void> {
    return this.queueLifecycle(async () => {
      if (!['READY', 'RUNNING'].includes(this.state)) return;
      ++this.generation; this.commandController?.abort(new Error('session stopped')); this.state = 'STOPPING';
      try { await stopFn(); } finally { this.clearTimeout(); this.state = 'STOPPED'; }
    });
  }

  async restart(startFn: () => Promise<void>, stopFn: StopFn = this.stopFn ?? (async () => {})): Promise<void> {
    await this.stop(stopFn); await this.start(startFn);
  }

  destroy(): Promise<void> {
    return this.queueLifecycle(async () => {
      if (this.state === 'STOPPED') return;
      ++this.generation; this.commandController?.abort(new Error('session destroyed')); this.clearTimeout();
      if (['READY', 'RUNNING'].includes(this.state)) {
        this.state = 'STOPPING';
        try { if (this.stopFn) await this.stopFn(); } finally { this.state = 'STOPPED'; }
      } else if (this.state !== 'IDLE') this.state = 'STOPPED';
    });
  }

  private queueLifecycle(operation: () => Promise<void>): Promise<void> {
    const next = this.lifecycle.then(operation, operation);
    this.lifecycle = next.catch(() => undefined);
    return next;
  }
  private armTimeout(generation: number): void { this.clearTimeout(); this.timer = setTimeout(() => { if (generation === this.generation) void this.destroy(); }, this.limits.timeoutMs); }
  private clearTimeout(): void { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
}
