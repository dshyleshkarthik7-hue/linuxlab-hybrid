import './core/verified-iso-fetch.ts';
import './v86-telemetry.ts';
import { V86LinuxTerminal } from './main-v86.ts';

declare global {
  interface Window {
    linuxLabVM?: V86LinuxTerminal;
  }
}

/** Normalize the constructor name exposed by the vendored v86 runtime. */
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

function startLinuxLabVM(): void {
  if (window.linuxLabVM) return;
  window.linuxLabVM = new V86LinuxTerminal();
}

exposeV86Constructor();

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startLinuxLabVM, { once: true });
} else {
  startLinuxLabVM();
}
