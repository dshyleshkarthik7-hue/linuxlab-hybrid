import './core/verified-iso-fetch.ts';
import './v86-telemetry.ts';
import { V86LinuxTerminal } from './main-v86.ts';

declare global {
  interface Window {
    linuxLabVM?: V86LinuxTerminal;
  }
}

/**
 * Normalize v86's constructor globals without redeclaring its existing
 * TypeScript declarations. The bundled v86 typings define V86 and V86Starter
 * with different constructor result types, so direct assignment produces
 * TS2322 even though the runtime constructors are interchangeable here.
 */
function exposeV86Constructor(): void {
  if (typeof window.V86 !== 'function' && typeof window.V86Starter === 'function') {
    Object.defineProperty(window, 'V86', {
      configurable: true,
      writable: true,
      value: window.V86Starter,
    });
  }
}

/**
 * Initialize after DOMContentLoaded when necessary, but also handle the case
 * where this module executes after DOMContentLoaded has already fired.
 */
function ensureLinuxLabVM(): void {
  exposeV86Constructor();

  if (!window.linuxLabVM) {
    window.linuxLabVM = new V86LinuxTerminal();
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', ensureLinuxLabVM, { once: true });
} else {
  ensureLinuxLabVM();
}
