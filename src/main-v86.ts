import { V86 } from './v86-runtime.ts';
import { PROFILES, type VMProfile } from './vm-profile-catalog.ts';
import { VMRuntimeResourceEnforcer } from './vm-resource-policy.ts';
import { attachGuestTelemetry, type GuestIdentity } from './v86-telemetry.ts';
import { verifySha256 } from './ISOIntegrity.ts';
import { detectGuestIdentity, type GuestIdentityKind } from './observability/GuestIdentity.ts';

// v86's runtime is loaded lazily so the page can render before the WASM bundle arrives.
let TerminalCtor: typeof import('xterm').Terminal | null = null;
let FitAddonCtor: typeof import('xterm-addon-fit').FitAddon | null = null;

async function loadTerminalDeps(): Promise<void> {
  if (TerminalCtor && FitAddonCtor) return;
  const [xterm, fit] = await Promise.all([import('xterm'), import('xterm-addon-fit')]);
  TerminalCtor = xterm.Terminal;
  FitAddonCtor = fit.FitAddon;
}

void loadTerminalDeps();

export class V86TerminalController {
  private term: import('xterm').Terminal;
  private fitAddon: import('xterm-addon-fit').FitAddon;
  private emulator: V86 | null = null;
  private profile: VMProfile = PROFILES.developer;
  private enforcer: VMRuntimeResourceEnforcer | null = null;
  private bootId = 0;
  private bootController: AbortController | null = null;
  private ready = false;
  private health: 'booting' | 'ready' | 'offline' = 'booting';
  private serial = '';
  private bootTimeout: number | null = null;
  private bootPromptTimer: number | null = null;
  private sessionTimer: number | null = null;
  private bootPromptSent = false;
  private bootStage = 'starting';
  private lastSerialAt = 0;
  private guestIdentity: GuestIdentity | null = null;

  constructor(containerId = 'v86-terminal-container') {
    if (!TerminalCtor || !FitAddonCtor) throw new Error('Terminal runtime failed to load');
    const container = document.getElementById(containerId);
    if (!container) throw new Error('Terminal container is missing');
    this.term = new TerminalCtor({ cursorBlink: true, fontSize: 14, convertEol: true, scrollback: 10000 });
    this.fitAddon = new FitAddonCtor();
    this.term.loadAddon(this.fitAddon);
    this.term.open(container);
    this.terminalDataDisposable = this.term.onData((data: string) => { if (this.canUseRuntime()) this.emulator?.serial0_send(data); });
    window.addEventListener('resize', () => this.fit());
    setTimeout(() => this.fit(), 100);
    this.bindControls();
    void this.start(this.profile);
  }

  private terminalDataDisposable: { dispose(): void };

  private bindControls(): void {
    document.getElementById('btn-v86-alpine')?.addEventListener('click', () => void this.start(PROFILES.developer));
    document.getElementById('btn-v86-virt')?.addEventListener('click', () => void this.start(PROFILES.virt));
    document.getElementById('btn-v86-linux4')?.addEventListener('click', () => void this.start(PROFILES.linux4));
    document.getElementById('btn-v86-restart')?.addEventListener('click', () => void this.start(this.profile));
    document.getElementById('btn-v86-terminal')?.addEventListener('click', () => this.showTerminal());
    document.getElementById('btn-v86-screen')?.addEventListener('click', () => this.showScreen());
    document.getElementById('btn-v86-diagnostics')?.addEventListener('click', () => this.showDiagnostics());
    document.getElementById('btn-v86-copydiag')?.addEventListener('click', () => void this.copyDiagnostics());
  }
