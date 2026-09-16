import './core/verified-iso-fetch.ts';
import './v86-telemetry.ts';
import { V86LinuxTerminal } from './main-v86.ts';

declare global {
  interface Window {
    linuxLabVM?: V86LinuxTerminal;
  }
}

/**
 * There is exactly one VM initialization path: main-v86.ts owns creation
 * from its DOMContentLoaded handler. This entry module only normalizes the
 * runtime constructor name before that handler runs; it must never construct
 * another V86LinuxTerminal instance.
 */
function exposeV86Constructor(): void {
  const win = window as Window & {
    V86Starter?: new (options: Record<string, unknown>) => unknown;
    V86?: new (options: Record<string, unknown>) => unknown;
  };

  if (typeof win.V86Starter === 'function' && typeof win.V86 !== 'function') {
    Object.defineProperty(win, 'V86', {
      configurable: true,
      writable: true,
      value: win.V86Starter,
    });
  }
}

/**
 * main-v86.ts uses xterm's fit() when the VGA screen is shown. The current
 * fit() implementation also schedules a resize event whenever the screen is
 * visible. That resize listener calls fit() again, creating a perpetual
 * requestAnimationFrame -> resize -> fit loop. In Chromium this can starve
 * Playwright immediately after the Screen button is clicked.
 *
 * Keep xterm fitting, but suppress that synthetic resize feedback loop. Real
 * browser resize events still reach the original resize listener and call the
 * guarded fit method normally.
 */
function preventScreenResizeFeedbackLoop(): void {
  const prototype = V86LinuxTerminal.prototype as unknown as {
    fit?: () => void;
    fitAddon?: { fit?: () => void };
  };

  if (typeof prototype.fit !== 'function') return;

  prototype.fit = function guardedFit(this: V86LinuxTerminal): void {
    try {
      const instance = this as unknown as {
        fitAddon?: { fit?: () => void };
      };
      instance.fitAddon?.fit?.();
    } catch {
      // Fit is best-effort; preserve the previous behavior on layout errors.
    }
  };
}

exposeV86Constructor();
preventScreenResizeFeedbackLoop();

// main-v86.ts owns VM construction. Do not instantiate V86LinuxTerminal here.
void V86LinuxTerminal;
