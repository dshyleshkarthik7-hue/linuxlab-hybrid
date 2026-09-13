export interface V86LoadTarget {
  add_listener(name: 'emulator-loaded', callback: () => void): void;
}

/** Waits for v86's public image/runtime-loaded lifecycle point before run(). */
export function waitForV86Loaded(vm: V86LoadTarget, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: number | undefined;
    const finish = (error?: unknown): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      if (error) reject(error instanceof Error ? error : new Error(String(error)));
      else resolve();
    };
    try {
      vm.add_listener('emulator-loaded', () => finish());
      timer = window.setTimeout(() => finish(new Error('v86 emulator initialization timed out')), Math.max(1, timeoutMs));
    } catch (error) {
      finish(error);
    }
  });
}
