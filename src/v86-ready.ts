export interface V86LoadTarget {
  add_listener(name: 'emulator-loaded', callback: () => void): void;
  remove_listener?: (name: 'emulator-loaded', callback: () => void) => void;
}

/** Waits for v86's public image/runtime-loaded lifecycle point before run(). */
export function waitForV86Loaded(vm: V86LoadTarget, timeoutMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: number | undefined;
    const onLoaded = (): void => finish();
    const cleanup = (): void => {
      if (timer !== undefined) window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      vm.remove_listener?.('emulator-loaded', onLoaded);
    };
    const finish = (error?: unknown): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error instanceof Error ? error : new Error(String(error)));
      else resolve();
    };
    const onAbort = (): void => finish(new DOMException('v86 initialization was aborted', 'AbortError'));
    if (signal?.aborted) { onAbort(); return; }
    try {
      vm.add_listener('emulator-loaded', onLoaded);
      signal?.addEventListener('abort', onAbort, { once: true });
      timer = window.setTimeout(() => finish(new Error('v86 emulator initialization timed out')), Math.max(1, timeoutMs));
    } catch (error) {
      finish(error);
    }
  });
}
