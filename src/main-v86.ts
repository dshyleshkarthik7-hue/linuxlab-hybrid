import * as xtermModule from '@xterm/xterm';
import * as fitModule from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { attachGuestTelemetry, type GuestIdentity, type V86TelemetryTarget } from './v86-telemetry.ts';
import { VM_RESOURCE_POLICIES, VMRuntimeResourceEnforcer, type VMResourcePolicyName } from './engine/VMResourcePolicy.ts';
import { artifactForIsoUrl, fetchVerifiedIso } from './core/verified-iso-fetch.ts';
import { waitForV86Loaded } from './v86-ready.ts';

const TerminalCtor = xtermModule.Terminal;
const FitAddonCtor = fitModule.FitAddon;

declare global { interface Window { linuxLabVM?: V86LinuxTerminal; } }

type V86Runtime = V86TelemetryTarget & {
  serial0_send: (data: string) => void;
  keyboard_send_text?: (data: string) => void;
  keyboard_set_enabled?: (enabled: boolean) => void;
  keyboard_set_status?: (enabled: boolean) => void;
  run?: () => void | Promise<void>;
  stop?: () => void;
  destroy?: () => void;
  add_listener: (event: string, callback: (value?: number) => void) => void;
  wait_until_vga_screen_contains?: (text: string | RegExp, options?: { timeout_msec?: number }) => Promise<boolean>;
};
type RuntimeWindow = Window & { V86Starter?: unknown; V86?: unknown };
type Profile = { name: string; memoryMiB: number; cdrom: string; policy: VMResourcePolicyName; expectedGuest: 'alpine' };

const VIRT_PROFILE: Profile = { name: 'Alpine Virt 3.24.1', memoryMiB: 54, cdrom: '/api/iso?image=virt', policy: 'virt', expectedGuest: 'alpine' };
const DEVELOPER_PROFILE: Profile = { name: 'Developer Alpine v1.0.0', memoryMiB: 1024, cdrom: '/api/iso?image=developer', policy: 'developer', expectedGuest: 'alpine' };
const FIRMWARE_BASE = '/api/v86-firmware';
const READY_MARKER = '__LINUXLAB_READY__';
const PROBE_MARKER = '__LINUXLAB_INPUT_OK__';

function profileFromPage(): Profile { return document.documentElement.dataset.v86Profile === 'developer' ? DEVELOPER_PROFILE : VIRT_PROFILE; }

export class V86LinuxTerminal {
  private term: xtermModule.Terminal;
  private fitAddon: fitModule.FitAddon;
  private emulator: V86Runtime | null = null;
  private telemetryDispose: (() => void) | null = null;
  private static runtimePromise: Promise<void> | null = null;
  private profile: Profile = profileFromPage();
  private enforcer: VMRuntimeResourceEnforcer | null = null;
  private bootController: AbortController | null = null;
  private bootId = 0;
  private bootTimeout: number | null = null;
  private sessionTimer: number | null = null;
  private ready = false;
  private vgaReady = false;
  private shellReady = false;
  private guestIdentity: GuestIdentity | null = null;
  private initializationFailure: Error | null = null;
  private health: 'booting' | 'ready' | 'offline' = 'booting';
  private bootStage = 'starting';
  private integrityState: 'verified' | 'unverified' = 'unverified';
  private serial = '';
  private lastSerialAt = 0;
  private activeView: 'terminal' | 'screen' = 'terminal';

  constructor(containerId = 'v86-terminal-container') {
    if (!TerminalCtor || !FitAddonCtor) throw new Error('Terminal runtime failed to load');
    const container = document.getElementById(containerId);
    if (!container) throw new Error('Terminal container is missing');
    this.term = new TerminalCtor({ cursorBlink: true, fontSize: 14, convertEol: true, scrollback: 10000 });
    this.fitAddon = new FitAddonCtor();
    this.term.loadAddon(this.fitAddon);
    this.term.open(container);
    // Keep the xterm listener attached for the lifetime of the terminal so rebooting the VM cannot orphan input.
    this.term.onData((data) => this.sendInput(data));
    window.addEventListener('resize', () => this.fit());
    window.addEventListener('orientationchange', () => setTimeout(() => this.fit(), 50));
    document.getElementById('screen_container')?.addEventListener('pointerdown', () => this.enableGuestKeyboard(), { passive: true });
    this.bindControls();
    window.linuxLabVM = this;
    setTimeout(() => this.fit(), 100);
    void this.start();
  }

  public sendMobileInput(data: string): void { this.sendInput(data); }

  private setGuestKeyboardEnabled(enabled: boolean): void {
    const vm = this.emulator;
    if (!vm) return;
    if (vm.keyboard_set_enabled) vm.keyboard_set_enabled(enabled);
    else vm.keyboard_set_status?.(enabled);
  }
  private enableGuestKeyboard(): void { this.setGuestKeyboardEnabled(true); }

  private sendInput(data: string): void {
    const vm = this.emulator;
    if (!vm || !this.enforcer || this.enforcer.isStopped() || this.enforcer.sessionExpired()) return;
    if (vm.keyboard_send_text) vm.keyboard_send_text(data);
    else vm.serial0_send(data);
  }

  private bindControls(): void {
    document.getElementById('btn-v86-virt')?.addEventListener('click', () => void this.start());
    document.getElementById('btn-v86-restart')?.addEventListener('click', () => void this.start());
    document.getElementById('btn-v86-terminal')?.addEventListener('click', () => this.showTerminal());
    document.getElementById('btn-v86-screen')?.addEventListener('click', () => this.showScreen());
    document.getElementById('btn-v86-diagnostics')?.addEventListener('click', () => this.showDiagnostics());
    document.getElementById('btn-v86-copydiag')?.addEventListener('click', () => void this.copyDiagnostics());
  }

  private async start(): Promise<void> {
    const id = ++this.bootId;
    this.bootController?.abort();
    this.bootController = new AbortController();
    const signal = this.bootController.signal;
    await this.dispose();
    if (id !== this.bootId || signal.aborted) return;
    this.profile = profileFromPage();
    this.enforcer = new VMRuntimeResourceEnforcer(VM_RESOURCE_POLICIES[this.profile.policy]);
    this.ready = false;
    this.vgaReady = false;
    this.shellReady = false;
    this.guestIdentity = null;
    this.initializationFailure = null;
    this.serial = '';
    this.lastSerialAt = 0;
    this.bootStage = 'starting';
    this.setHealth('booting');
    this.setIntegrityState('unverified');
    this.showTerminal();
    this.term.clear();
    this.term.writeln(`LinuxTerminal — ${this.profile.name}`);
    this.status(`${this.profile.name} • checking runtime`);
    try {
      await this.loadRuntime(signal);
      if (id !== this.bootId || signal.aborted) return;
      this.bootStage = 'verifying firmware';
      this.status(`${this.profile.name} • verifying firmware`);
      await this.preflightRuntimeAssets(signal);
      if (id !== this.bootId || signal.aborted) return;
      const artifact = artifactForIsoUrl(this.profile.cdrom);
      this.bootStage = 'verifying image';
      this.status(`${this.profile.name} • verifying image`);
      const isoBytes = await fetchVerifiedIso(this.profile.cdrom, signal);
      if (!isoBytes.byteLength) throw new Error('Verified Linux image is empty');
      this.setIntegrityState('verified');
      const screen = document.getElementById('screen_container');
      if (!screen) throw new Error('VM screen container is missing');
      const policy = this.enforcer;
      if (!policy) throw new Error('VM resource policy was not initialized');
      const runtimeWindow = window as RuntimeWindow;
      const Runtime = (typeof runtimeWindow.V86Starter === 'function' ? runtimeWindow.V86Starter : runtimeWindow.V86) as ((new (options: Record<string, unknown>) => V86Runtime) | undefined);
      if (!Runtime) throw new Error('Local v86 runtime did not expose a constructor');
      this.bootStage = 'creating VM';
      this.status(`${this.profile.name} • creating VM`);
      this.monitor(`${this.profile.memoryMiB} MiB allocation • ${artifact.filename} verified`);
      const vm = new Runtime({
        wasm_path: '/v86.wasm', memory_size: policy.memoryBytes, vga_memory_size: policy.vgaMemoryBytes,
        screen_container: screen, bios: { url: `${FIRMWARE_BASE}/seabios.bin` }, vga_bios: { url: `${FIRMWARE_BASE}/vgabios.bin` },
        cdrom: { buffer: isoBytes }, boot_order: 0x213, fastboot: true, bootmenu: false, autostart: false,
        disable_speaker: true, net_device: { type: 'none' },
      });
      this.emulator = vm;
      this.setNetworkState('disabled');
      this.setGuestKeyboardEnabled(true);
      this.sessionTimer = window.setTimeout(() => this.fail('VM session resource limit reached'), policy.remainingSessionMs());
      this.telemetryDispose = attachGuestTelemetry(vm, {
        onTelemetry: (sample) => {
          if (id === this.bootId) this.monitor(`Guest activity • ${sample.kernel} ${sample.architecture} • ${sample.cpuPercent.toFixed(1)}% CPU`);
        },
        onIdentity: (identity) => { if (id === this.bootId) this.acceptGuestIdentity(identity); },
      });
      vm.add_listener('serial0-output-byte', (value) => { if (id === this.bootId && typeof value === 'number') this.serialOutput(value); });
      this.scheduleBootWatchdog(id, policy.policy.bootTimeoutMs);
      const run = vm.run;
      if (typeof run !== 'function') throw new Error('Local v86 runtime does not expose run()');
      this.bootStage = 'initializing v86';
      this.status(`${this.profile.name} • initializing v86`);
      await waitForV86Loaded(vm, policy.policy.bootTimeoutMs, signal);
      if (id !== this.bootId || signal.aborted) return;
      this.bootStage = 'booting Alpine';
      this.status(`${this.profile.name} • booting Alpine`);
      await run.call(vm);
      if (id !== this.bootId || signal.aborted) return;
      await this.waitForGuestReady(policy.policy.bootTimeoutMs);
    } catch (error) {
      if (id === this.bootId && !signal.aborted) {
        const failure = error instanceof Error ? error : new Error(String(error));
        this.fail(failure.message, failure);
      }
    }
  }

  public async waitForGuestReady(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!this.emulator && !this.initializationFailure && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    if (this.initializationFailure) throw this.initializationFailure;
    const vm = this.emulator;
    if (!vm) throw new Error('v86 emulator was not created before readiness wait');
    const waitForVga = vm.wait_until_vga_screen_contains;
    if (typeof waitForVga === 'function') {
      while (Date.now() < deadline && !this.initializationFailure) {
        try {
          await waitForVga.call(vm, /Alpine Linux|Welcome to Alpine|localhost login:|LinuxLab Engine B/i, { timeout_msec: 1000 });
          this.vgaReady = true;
          break;
        } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
      }
    }
    if (this.initializationFailure) throw this.initializationFailure;
    const serialPrompt = /(?:\r?\n|^)\s*(?:[^\r\n]*[:~\/])?\s*[#$]\s*$/m.test(this.serial);
    const serialReady = serialPrompt || this.serial.includes(READY_MARKER);
    if (this.vgaReady && vm.keyboard_send_text && waitForVga) {
      const remaining = Math.max(1000, deadline - Date.now());
      try {
        vm.keyboard_send_text(`echo ${PROBE_MARKER}\n`);
        await waitForVga.call(vm, new RegExp(PROBE_MARKER), { timeout_msec: Math.min(5000, remaining) });
        this.shellReady = true;
      } catch {
        this.shellReady = serialReady;
      }
    } else {
      this.shellReady = serialReady;
    }
    if (!this.shellReady) throw new Error('Alpine shell readiness was not observed');
    if (!this.guestIdentity) this.guestIdentity = { kind: 'alpine', isAlpine: true, release: 'verified Alpine image; interactive shell observed' };
    this.markReadyIfIdentityVerified();
    if (!this.ready) throw new Error('Guest boot did not reach the verified ready state');
  }

  private acceptGuestIdentity(identity: GuestIdentity): void {
    if (!identity.isAlpine || identity.kind !== this.profile.expectedGuest) {
      if (identity.kind !== 'unknown') this.fail(`Guest identity mismatch: expected ${this.profile.expectedGuest}`);
      return;
    }
    this.guestIdentity = identity;
    this.monitor(`Alpine identity detected • ${this.profile.memoryMiB} MiB allocation`);
    this.markReadyIfIdentityVerified();
  }

  private markReadyIfIdentityVerified(): void {
    if (this.ready || !this.guestIdentity?.isAlpine || !this.shellReady) return;
    this.ready = true;
    this.bootStage = 'interactive Alpine shell verified';
    if (this.bootTimeout !== null) window.clearTimeout(this.bootTimeout);
    this.bootTimeout = null;
    this.setHealth('ready');
    this.status(`${this.profile.name} • running`);
    this.monitor('Interactive Alpine shell verified • network disabled');
    this.fit();
  }

  private serialOutput(byte: number): void {
    if (!this.enforcer?.acceptSerialByte(1)) { this.fail('VM serial output limit reached'); return; }
    const ch = String.fromCharCode(byte & 255);
    this.lastSerialAt = Date.now();
    this.serial = (this.serial + ch).slice(-65536);
    const identity = this.detectGuestIdentity(this.serial);
    if (identity) this.acceptGuestIdentity(identity);
    const accepted = this.enforcer.acceptOutput(ch);
    if (accepted.value) this.term.write(accepted.value);
    if (this.serial.includes(READY_MARKER) || /(?:\r?\n|^)\s*(?:[^\r\n]*[:~\/])?\s*[#$]\s*$/.test(this.serial)) this.shellReady = true;
    if (this.shellReady) this.markReadyIfIdentityVerified();
  }

  private detectGuestIdentity(text: string): GuestIdentity | null {
    if (/(?:^|\r?\n)ID=alpine(?:\r?\n|$)/im.test(text) || /Alpine Linux/i.test(text)) return { kind: 'alpine', isAlpine: true, release: text.slice(-4096) };
    return null;
  }

  private loadRuntime(signal: AbortSignal): Promise<void> {
    const runtimeWindow = window as RuntimeWindow;
    if (typeof runtimeWindow.V86Starter === 'function' || typeof runtimeWindow.V86 === 'function') return Promise.resolve();
    if (V86LinuxTerminal.runtimePromise) return V86LinuxTerminal.runtimePromise;
    V86LinuxTerminal.runtimePromise = new Promise<void>((resolve, reject) => {
      const script = document.querySelector<HTMLScriptElement>('script[data-linuxlab-v86]');
      if (!script) { reject(new Error('Missing static /libv86.js runtime tag')); return; }
      const finish = () => typeof runtimeWindow.V86Starter === 'function' || typeof runtimeWindow.V86 === 'function' ? resolve() : reject(new Error('libv86.js loaded without a V86 constructor'));
      script.addEventListener('load', finish, { once: true });
      script.addEventListener('error', () => reject(new Error('Failed to load /libv86.js')), { once: true });
      if (typeof runtimeWindow.V86Starter === 'function' || typeof runtimeWindow.V86 === 'function') finish();
    });
    V86LinuxTerminal.runtimePromise = V86LinuxTerminal.runtimePromise.catch((error) => { V86LinuxTerminal.runtimePromise = null; throw error; });
    void signal;
    return V86LinuxTerminal.runtimePromise;
  }

  private async preflightRuntimeAssets(signal: AbortSignal): Promise<void> {
    const assets = [
      { url: `${FIRMWARE_BASE}/seabios.bin`, size: 131072, sha256: '73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98' },
      { url: `${FIRMWARE_BASE}/vgabios.bin`, size: 36352, sha256: 'a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880' },
    ];
    for (const asset of assets) {
      const response = await fetch(asset.url, { cache: 'no-store', signal });
      if (!response.ok) throw new Error(`Required VM firmware failed to load: ${asset.url} (${response.status})`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== asset.size) throw new Error(`Required VM firmware failed size verification: ${asset.url}`);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const actual = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      if (actual !== asset.sha256) throw new Error(`Required VM firmware failed SHA-256 verification: ${asset.url}`);
    }
  }

  private scheduleBootWatchdog(id: number, timeoutMs: number): void {
    if (this.bootTimeout !== null) window.clearTimeout(this.bootTimeout);
    this.bootTimeout = window.setTimeout(() => { if (!this.ready && id === this.bootId) this.fail('guest boot timeout'); }, timeoutMs);
  }

  private fail(message: string, cause?: Error): void {
    this.initializationFailure = cause ?? new Error(message);
    this.ready = false;
    this.shellReady = false;
    this.bootStage = 'error';
    this.setHealth('offline');
    this.setIntegrityState('unverified');
    if (this.bootTimeout !== null) { window.clearTimeout(this.bootTimeout); this.bootTimeout = null; }
    if (this.sessionTimer !== null) { window.clearTimeout(this.sessionTimer); this.sessionTimer = null; }
    this.enforcer?.stop();
    try { this.emulator?.stop?.(); this.emulator?.destroy?.(); } catch {}
    this.emulator = null;
    this.status(`${this.profile.name} • ${message}`);
    this.monitor(`Offline • ${message}`);
    this.term.writeln(`\r\n[VM error] ${message}`);
  }

  private showTerminal(): void {
    this.activeView = 'terminal';
    const screen = document.getElementById('screen_container');
    const terminal = document.getElementById('v86-terminal-container');
    if (screen) screen.hidden = true;
    if (terminal) terminal.hidden = false;
    this.setGuestKeyboardEnabled(true);
    this.fit();
    this.term.focus();
  }
  private showScreen(): void {
    this.activeView = 'screen';
    const screen = document.getElementById('screen_container');
    const terminal = document.getElementById('v86-terminal-container');
    if (screen) screen.hidden = false;
    if (terminal) terminal.hidden = true;
    this.setGuestKeyboardEnabled(true);
    this.fit();
  }
  private status(text: string): void { document.getElementById('v86-status')?.replaceChildren(document.createTextNode(text)); }
  private monitor(text: string): void { document.getElementById('v86-monitor')?.replaceChildren(document.createTextNode(text)); }
  private setHealth(state: 'booting' | 'ready' | 'offline'): void {
    this.health = state;
    const element = document.getElementById('v86-health');
    if (element) { element.dataset.state = state; element.setAttribute('aria-label', state === 'ready' ? 'VM working' : state === 'booting' ? 'VM booting' : 'VM offline'); }
  }
  private setNetworkState(state: 'disabled' | 'enabled'): void { const element = document.getElementById('v86-health'); if (element) element.dataset.network = state; }
  private setIntegrityState(state: 'verified' | 'unverified'): void { this.integrityState = state; const element = document.getElementById('v86-health'); if (element) element.dataset.integrity = state; }
  private fit(): void { try { this.fitAddon.fit(); } catch {} }

  private showDiagnostics(): void {
    const element = document.getElementById('v86-diagnostics');
    if (!element) return;
    element.hidden = !element.hidden;
    if (!element.hidden) element.textContent = [
      `Profile: ${this.profile.name}`, `Memory allocation: ${this.profile.memoryMiB} MiB`, `Image: ${this.profile.cdrom}`,
      `Stage: ${this.bootStage}`, `Health: ${this.health}`, `View: ${this.activeView}`, 'Network: disabled',
      `Integrity: ${this.integrityState}`, `VGA: ${this.vgaReady ? 'detected' : 'pending'}`, `Shell: ${this.shellReady ? 'interactive' : 'pending'}`,
      `Guest: ${this.guestIdentity?.kind || 'unknown'}`, `Initialization failure: ${this.initializationFailure?.message || 'none'}`,
      `Last serial: ${this.lastSerialAt ? new Date(this.lastSerialAt).toISOString() : 'none'}`,
    ].join('\n');
  }
  private async copyDiagnostics(): Promise<void> {
    const element = document.getElementById('v86-diagnostics');
    if (!element) return;
    if (element.hidden) this.showDiagnostics();
    try { await navigator.clipboard.writeText(element.textContent || ''); } catch {}
  }
  private async dispose(): Promise<void> {
    if (this.bootTimeout !== null) { window.clearTimeout(this.bootTimeout); this.bootTimeout = null; }
    if (this.sessionTimer !== null) { window.clearTimeout(this.sessionTimer); this.sessionTimer = null; }
    this.telemetryDispose?.();
    this.telemetryDispose = null;
    try { this.emulator?.stop?.(); this.emulator?.destroy?.(); } catch {}
    this.emulator = null;
    this.enforcer?.stop();
    this.enforcer = null;
  }
}
