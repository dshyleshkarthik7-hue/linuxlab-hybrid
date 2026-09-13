import './core/verified-iso-fetch.ts';
import './v86-telemetry.ts';
import { V86LinuxTerminal } from './main-v86.ts';

declare global {
  interface Window {
    V86?: typeof V86LinuxTerminal extends never ? unknown : Window['V86Starter'];
    V86Starter?: new (options: Record<string, unknown>) => unknown;
    linuxLabVM?: V86LinuxTerminal;
  }
}

/**
 * v86 must be available as a stable global for the real-guest test contract.
 * Some v86 builds expose the constructor as V86Starter while the test suite
 * checks V86. Keep both names pointing at the same constructor.
 */
function exposeV86Constructor(): void {
  if (
    typeof window.V86Starter === 'function' &&
    typeof window.V86 !== 'function'
  ) {
    window.V86 = window.V86Starter;
  }
}

/**
 * main-v86 normally creates the terminal from its DOMContentLoaded handler.
 * This fallback makes initialization race-proof when a bundler/runtime loads
 * the module after DOMContentLoaded has already fired.
 */
function ensureLinuxLabVM(): void {
  exposeV86Constructor();

  if (!window.linuxLabVM) {
    window.linuxLabVM = new V86LinuxTerminal();
  }
}

if (document.readyState === 'loading') {
  window.addEventListener(
    'DOMContentLoaded',
    ensureLinuxLabVM,
    { once: true },
  );
} else {
  ensureLinuxLabVM();
}
