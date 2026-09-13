import './core/verified-iso-fetch.ts';
import './v86-telemetry.ts';
import { V86LinuxTerminal } from './main-v86.ts';

declare global {
  interface Window {
    linuxLabVM?: V86LinuxTerminal;
  }
}

/**
 * v86's type declarations already define Window.V86 and Window.V86Starter.
 * Do not redeclare either property here: a different constructor return type
 * causes TS2717/TS2322 during the production build.
 *
 * Some v86 builds expose the constructor as V86Starter while the real-guest
 * test contract checks V86, so normalize the runtime aliases instead.
 */
function exposeV86Constructor(): void {
  if (typeof window.V86 !== 'function' && typeof window.V86Starter === 'function') {
    window.V86 = window.V86Starter;
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
