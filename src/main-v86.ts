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
  serial0_send: (d: string) => void;
  keyboard_send_text?: (d: string) => void;
  run?: () => void | Promise<void>;
  stop?: () => void;
  destroy?: () => void;
  add_listener: (event: string, cb: (value?: number) => void) => void;
  wait_until_vga_screen_contains?: (text: string | RegExp, options?: { timeout_msec?: number }) => Promise<void>;
};
type RuntimeWindow = Window & { V86Starter?: unknown; V86?: unknown };
type ProfileName = 'developer' | 'virt';
type Profile = {
  name: string;
  memoryMiB: number;
  cdrom: string;
  policy: VMResourcePolicyName;
  expectedGuest: 'alpine';
};

const PROFILES: Record<ProfileName, Profile> = {
  developer: { name: 'Developer Alpine', memoryMiB: 1024, cdrom: '/api/iso', policy: 'developer', expectedGuest: 'alpine' },
  virt: { name: 'Alpine Virt 3.24.1', memoryMiB: 54, cdrom: '/api/iso?image=virt', policy: 'virt', expectedGuest: 'alpine' }
};
const FIRMWARE_BASE = '/api/v86-firmware';

function initialProfile(): Profile {
  return new URLSearchParams(window.location.search).get('profile') === 'virt' ? PROFILES.virt : PROFILES.developer;
}

export class V86LinuxTerminal {
  private term: xtermModule.Terminal;
  private fitAddon: fitModule.FitAddon;
  private emulator: V86Runtime | null = null;
  private telemetryDispose: (() => void) | null = null;
  private terminalDataDisposable: { dispose(): void } | null = null;
  private static runtimePromise: Promise<void> | null = null;
  private profile = initialProfile();
  private enforcer: VMRuntimeResourceEnforcer | null = null;
  private bootController: AbortController | null = null;
  private bootId = 0;
  private bootTimeout: number | null = null;
  private sessionTimer: number | null = null;
  private ready = false;
  private vgaReady = false;
  private guestIdentity: GuestIdentity | null = null;
  private initializationFailure: Error | null = null;
  private health: 'booting' | 'ready' | 'offline' = 'booting';
  private bootStage = 'starting';
  private serial = '';
  private lastSerialAt = 0;
  private lastGuestActivityAt: number | null = null;

  constructor(containerId = 'v86-terminal-container') {
    if (!TerminalCtor || !FitAddonCtor) throw new Error('Terminal runtime failed to load');
    const container = document.getElementById(containerId);
    if (!container) throw new Error('Terminal container is missing');
    this.term = new TerminalCtor({ cursorBlink: true, fontSize: 14, convertEol: true, scrollback: 10000 });
    this.fitAddon = new FitAddonCtor();
    this.term.loadAddon(this.fitAddon);
    this.term.open(container);
    this.terminalDataDisposable = this.term.onData((data) => this.sendInput(data));
    window.addEventListener('resize', () => this.fit());
    window.addEventListener('orientationchange', () => setTimeout(() => this.fit(), 50));
    setTimeout(() => this.fit(), 100);
    this.bindControls();
    window.linuxLabVM = this;
    void this.start(this.profile);
  }

  public sendMobileInput(data: string): void { this.sendInput(data); }

  private sendInput(data: string): void {
    const vm = this.emulator;
    if (!vm || !this.enforcer || this.enforcer.isStopped() || this.enforcer.sessionExpired()) return;
    if (vm.keyboard_send_text) vm.keyboard_send_text(data); else vm.serial0_send(data);
  }

  private bindControls(): void {
    document.getElementById('btn-v86-alpine')?.addEventListener('click', () => void this.start(PROFILES.developer));
    document.getElementById('btn-v86-virt')?.addEventListener('click', () => void this.start(PROFILES.virt));
    document.getElementById('btn-v86-restart')?.addEventListener('click', () => void this.start(this.profile));
    document.getElementById('btn-v86-terminal')?.addEventListener('click', () => this.showTerminal());
    document.getElementById('btn-v86-screen')?.addEventListener('click', () => this.showScreen());
    document.getElementById('btn-v86-diagnostics')?.addEventListener('click', () => this.showDiagnostics());
    document.getElementById('btn-v86-copydiag')?.addEventListener('click', () => void this.copyDiagnostics());
  }

  private async start(profile: Profile): Promise<void> {
    const id = ++this.bootId;
    this.bootController?.abort();
    this.bootController = new AbortController();
    const signal = this.bootController.signal;
    await this.dispose();
    if (id !== this.bootId || signal.aborted) return;

    this.profile = profile;
    this.enforcer = new VMRuntimeResourceEnforcer(VM_RESOURCE_POLICIES[profile.policy]);
    this.ready = false;
    this.vgaReady = false;
    this.guestIdentity = null;
    this.initializationFailure = null;
    this.serial = '';
    this.lastSerialAt = 0;
    this.lastGuestActivityAt = null;
    this.bootStage = 'starting';
    this.setHealth('booting');
    this.showTerminal();
    this.term.clear();
    this.status(`${profile.name} • checking runtime`);
    this.term.writeln(`LinuxTerminal — ${profile.name}`);

    try {
      await this.loadRuntime();
      if (id !== this.bootId || signal.aborted) return;
      await this.preflightRuntimeAssets(signal);
      if (id !== this.bootId || signal.aborted) return;

      const artifact = artifactForIsoUrl(profile.cdrom);
      this.status(`${profile.name} • verifying image`);
      const isoBytes = await fetchVerifiedIso(profile.cdrom, signal);
      if (!isoBytes.byteLength) throw new Error('Verified Linux image is empty');
      this.setIntegrityState('verified');

      const screen = document.getElementById('screen_container');
      if (!screen) throw new Error('VM screen container is missing');
      const policy = this.enforcer;
      if (!policy) throw new Error('VM resource policy was not initialized');
      const runtimeWindow = window as RuntimeWindow;
      const Runtime = (typeof runtimeWindow.V86Starter === 'function' ? runtimeWindow.V86Starter : runtimeWindow.V86) as
        ((new (options: Record<string, unknown>) => V86Runtime) | undefined);
      if (!Runtime) throw new Error('Local v86 runtime did not expose a constructor');

      this.bootStage = 'creating VM';
      this.status(`${profile.name} • booting`);
      this.monitor(`${profile.memoryMiB} MiB allocation • ${artifact.filename} verified`);
      const vm = new Runtime({
        wasm_path: '/v86.wasm',
        memory_size: policy.memoryBytes,
        vga_memory_size: policy.vgaMemoryBytes,
        screen_container: screen,
        bios: { url: `${FIRMWARE_BASE}/seabios.bin` },
        vga_bios: { url: `${FIRMWARE_BASE}/vgabios.bin` },
        cdrom: { buffer: isoBytes },
        boot_order: 0x213,
        fastboot: true,
        bootmenu: false,
        autostart: false,
        disable_speaker: true,
        net_device: { type: 'none' }
      });
      this.emulator = vm;
      this.setNetworkState('disabled');
      this.sessionTimer = window.setTimeout(() => this.fail('VM session resource limit reached'), policy.remainingSessionMs());
      this.telemetryDispose = attachGuestTelemetry(vm, {
        onTelemetry: (sample) => {
          if (id !== this.bootId) return;
          this.lastGuestActivityAt = sample.sampledAt;
          this.monitor(`Guest-reported activity • ${sample.kernel} ${sample.architecture} • ${sample.cpuPercent.toFixed(1)}% CPU • ${Math.round(sample.memoryBytes / 1024 / 1024)} MiB reported`);
        },
        onIdentity: (identity) => { if (id === this.bootId) this.acceptGuestIdentity(identity); }
      });
      vm.add_listener('serial0-output-byte', (value) => {
        if (id === this.bootId && typeof value === 'number') this.serialOutput(value);
      });
      this.scheduleBootWatchdog(id, policy.policy.bootTimeoutMs);
      this.fit();
      if (typeof vm.run !== 'function') throw new Error('Local v86 runtime does not expose run()');
      this.bootStage = 'waiting for v86 initialization';
      await waitForV86Loaded(vm, policy.policy.bootTimeoutMs, signal);
      if (id !== this.bootId || signal.aborted) return;
      this.bootStage = 'running v86';
      await vm.run?.();
    } catch (error) {
      if (id === this.bootId && !signal.aborted) {
        const failure = error instanceof Error ? error : new Error(String(error));
        this.fail(failure.message, failure);
      }
    }
  }

  public async waitForGuestReady(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!this.emulator && !this.initializationFailure && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    if (this.initializationFailure) throw this.initializationFailure;
    const vm = this.emulator;
    if (!vm) throw new Error('v86 emulator was not created before readiness wait');
    if (typeof vm.wait_until_vga_screen_contains !== 'function') throw new Error('v86 emulator does not expose wait_until_vga_screen_contains()');
    while (Date.now() < deadline && !this.initializationFailure) {
      try {
        await vm.wait_until_vga_screen_contains(/Alpine Linux|Welcome to Alpine|localhost login:/i, { timeout_msec: 1000 });
        this.vgaReady = true;
        break;
      } catch { await new Promise((r) => setTimeout(r, 50)); }
    }
    if (this.initializationFailure) throw this.initializationFailure;
    if (!this.vgaReady) throw new Error('Alpine VGA boot signature was not observed');
    if (!this.guestIdentity) {
      this.guestIdentity = { kind: 'alpine', isAlpine: true, release: 'verified Alpine image; VGA Alpine boot signature observed' };
      this.monitor('Verified Alpine image • VGA Alpine boot signature detected');
    }
    this.markReadyIfIdentityVerified();
    while (!this.ready && !this.initializationFailure && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    if (this.initializationFailure) throw this.initializationFailure;
    if (!this.ready) throw new Error('guest boot did not reach ready state after verified Alpine VGA readiness');
  }

  private acceptGuestIdentity(identity: GuestIdentity): void {
    if (!identity.isAlpine || identity.kind !== this.profile.expectedGuest) {
      if (identity.kind !== 'unknown') this.fail(`Guest identity mismatch: expected ${this.profile.expectedGuest}`);
      return;
    }
    this.guestIdentity = identity;
    this.monitor(`Guest-reported activity • ${this.profile.memoryMiB} MiB allocation • Alpine identity detected`);
    this.markReadyIfIdentityVerified();
  }

  private markReadyIfIdentityVerified(): void {
    if (this.ready || !this.vgaReady || !this.guestIdentity?.isAlpine || this.guestIdentity.kind !== this.profile.expectedGuest) return;
    this.ready = true;
    this.bootStage = 'VGA + Alpine identity verified';
    if (this.bootTimeout !== null) clearTimeout(this.bootTimeout);
    this.bootTimeout = null;
    this.setHealth('ready');
    this.status(`${this.profile.name} • running`);
    this.monitor(this.lastGuestActivityAt ? `Guest-reported activity • latest sample ${new Date(this.lastGuestActivityAt).toLocaleTimeString()}` : 'Verified Alpine image • VGA Alpine boot signature detected');
    this.fit();
  }

  private detectGuestIdentity(text: string): GuestIdentity | null {
    if (/(?:^|\r?\n)ID=alpine(?:\r?\n|$)/im.test(text) || /Alpine Linux/i.test(text)) return { kind: 'alpine', isAlpine: true, release: text.slice(-4096) };
    return null;
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
  }
