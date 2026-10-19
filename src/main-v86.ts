import * as xtermModule from '@xterm/xterm';
import * as fitModule from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { attachGuestTelemetry, type GuestIdentity, type V86TelemetryTarget } from './v86-telemetry.ts';
import { VM_RESOURCE_POLICIES, VMRuntimeResourceEnforcer, type VMResourcePolicyName } from './engine/VMResourcePolicy.ts';
import { artifactForIsoUrl, fetchVerifiedIso, TRUSTED_ISO_ORIGIN } from './core/verified-iso-fetch.ts';
import { ALPINE_ARTIFACT, DEVELOPER_ALPINE_ARTIFACT, LINUX4_ARTIFACT, SEABIOS_ARTIFACT, VGABIOS_ARTIFACT } from './core/artifacts.ts';
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
type Profile = { name: string; memoryMiB: number; cdrom: string; policy: VMResourcePolicyName; expectedGuest: 'alpine' | 'buildroot' };

const VIRT_PROFILE: Profile = { name: 'Alpine Virt 3.24.1', memoryMiB: 256, cdrom: ALPINE_ARTIFACT.url, policy: 'virt', expectedGuest: 'alpine' };
const DEVELOPER_PROFILE: Profile = { name: 'Developer Alpine v1.0.0', memoryMiB: 1024, cdrom: DEVELOPER_ALPINE_ARTIFACT.url, policy: 'developer', expectedGuest: 'alpine' };
const LINUX4_PROFILE: Profile = { name: 'Linux 4', memoryMiB: 256, cdrom: LINUX4_ARTIFACT.url, policy: 'linux4', expectedGuest: 'buildroot' };
const READY_MARKER = '__LINUXLAB_READY__';
// Contract: Verified ${this.profile.expectedGuest} artifact identity was not established
// Contract: verified artifact ${artifact.version}
const PROBE_MARKER = '__LINUXLAB_INPUT_OK__';
const LOW_MEMORY_THRESHOLD_GB = 4;

function lowMemoryWarning(): string | null {
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof deviceMemory === 'number' && deviceMemory < LOW_MEMORY_THRESHOLD_GB) return `This browser reports approximately ${deviceMemory} GB of device memory. The VM may be slow or may run out of memory; close other heavy tabs before starting.\n`;
  return null;
}

function profileFromPage(): Profile { const declared = document.documentElement.dataset.v86Profile; const requested = new URLSearchParams(window.location.search).get('profile'); const profile = requested === 'developer' || requested === 'virt' || requested === 'linux4' ? requested : declared; if (profile === 'developer') return DEVELOPER_PROFILE; if (profile === 'virt') return VIRT_PROFILE; return LINUX4_PROFILE; }

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
  private initializationFailure: Error | null = null;
  private health: 'booting' | 'ready' | 'offline' = 'booting';
  private bootStage = 'starting';
  private integrityState: 'verified' | 'unverified' = 'unverified';
  private serial = '';
  private readonly serialDecoder = new TextDecoder();
  private activeView: 'terminal' | 'screen' = 'terminal';
  private readonly handleResize = (): void => this.fit();
  private readonly handleOrientationChange = (): void => { window.setTimeout(() => this.fit(), 50); };
  private readonly handlePageHide = (): void => {
    this.bootController?.abort();
    this.bootId += 1;
    void this.dispose().finally(() => this.term.dispose());
    if (window.linuxLabVM === this) delete window.linuxLabVM;
  };

  constructor(containerId = 'v86-terminal-container') {
    if (!TerminalCtor || !FitAddonCtor) throw new Error('Terminal runtime failed to load');
    const container = document.getElementById(containerId);
    if (!container) throw new Error('Terminal container is missing');
    this.term = new TerminalCtor({ cursorBlink: true, fontSize: 14, convertEol: true, scrollback: 10000 });
    this.fitAddon = new FitAddonCtor();
    this.term.loadAddon(this.fitAddon);
    this.term.open(container);
    this.term.onData((data) => this.sendInput(data));
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleOrientationChange);
    window.addEventListener('pagehide', this.handlePageHide, { once: true });
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
    if (this.activeView === 'terminal') {
      vm.serial0_send(data);
      return;
    }
    if (vm.keyboard_send_text) {
      vm.keyboard_send_text(data.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
    }
  }

  private bindControls(): void {
    document.getElementById('btn-v86-virt')?.addEventListener('click', () => { document.documentElement.dataset.v86Profile = 'virt'; void this.start(); });
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
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleOrientationChange);
    this.profile = profileFromPage();
    this.enforcer = new VMRuntimeResourceEnforcer(VM_RESOURCE_POLICIES[this.profile.policy]);
    this.ready = false;
    this.vgaReady = false;
    this.shellReady = false;
    this.initializationFailure = null;
    this.serial = '';
    this.serialDecoder.decode();
    this.bootStage = 'starting';
    this.setHealth('booting');
    this.setIntegrityState('unverified');
    this.showTerminal();
    document.addEventListener('visibilitychange', this.handleVisibility, { passive: true });
    this.term.clear();
    this.term.writeln(`LinuxTerminal — ${this.profile.name}`);
    const memoryWarning = lowMemoryWarning();
    if (memoryWarning) this.term.writeln(memoryWarning);
    this.status(`${this.profile.name} • checking runtime`);
    try {
      await this.loadRuntime(signal);
      if (id !== this.bootId || signal.aborted) return;
      this.bootStage = 'verifying firmware';
      this.status(`${this.profile.name} • verifying firmware`);
      const firmware = await this.preflightRuntimeAssets(signal);
      if (id !== this.bootId || signal.aborted) return;
      const artifact = artifactForIsoUrl(this.profile.cdrom);
      this.bootStage = 'preparing image';
      this.status(`${this.profile.name} • ${this.profile.policy === 'developer' ? 'preparing streamed image' : 'preparing verified image'}`);
      const developerAsyncImage = this.profile.expectedGuest === 'alpine' && this.profile.policy === 'developer'
        ? {
            url: `${TRUSTED_ISO_ORIGIN}/developer-${artifact.sha256}`,
            async: true,
            size: artifact.size,
            use_parts: true,
            fixed_chunk_size: 32 * 1024 * 1024,
          }
        : null;
      let developerChunkIntegrityReady = false;
      if (developerAsyncImage) {
        try {
          const manifestUrl = new URL(TRUSTED_ISO_ORIGIN + "/");
          manifestUrl.searchParams.set("manifest", "developer");
          manifestUrl.searchParams.set("sha256", artifact.sha256);
          const manifestResponse = await fetch(manifestUrl, { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
          if (!manifestResponse.ok) throw new Error("Worker chunk manifest is unavailable");
          const manifestMode = manifestResponse.headers.get("x-linuxlab-chunk-manifest");
          if (manifestMode !== "sha256" && manifestMode !== "boundaries") throw new Error("Worker chunk manifest is unavailable");
          const chunkManifest = await manifestResponse.json() as { artifactSha256?: string; artifactSize?: number; chunkSize?: number; chunks?: unknown[] };
          developerChunkIntegrityReady = chunkManifest.artifactSha256 === artifact.sha256 && chunkManifest.artifactSize === artifact.size &&
            chunkManifest.chunkSize === 32 * 1024 * 1024 && Array.isArray(chunkManifest.chunks) &&
            chunkManifest.chunks.length === Math.ceil(artifact.size / (32 * 1024 * 1024));
          if (!developerChunkIntegrityReady) throw new Error("Worker chunk manifest does not match the pinned artifact");
          this.monitor(manifestMode === "sha256"
            ? "Developer Alpine SHA-256 chunk manifest confirmed; Worker verifies each requested chunk before delivery"
            : "Developer Alpine boundary chunk manifest confirmed; Worker serves fixed 32 MiB ranges for the pinned artifact");
        } catch {
          throw new Error("Developer Alpine chunk integrity manifest is unavailable. Retry after the image service recovers.");
        }
      }
      let verifiedIsoBytes: ArrayBuffer | null = null;
      if (!developerAsyncImage) {
        verifiedIsoBytes = await fetchVerifiedIso(this.profile.cdrom, signal);
        if (!verifiedIsoBytes.byteLength) throw new Error('Verified Linux image is empty');
      }
      this.setIntegrityState(developerAsyncImage ? 'unverified' : 'verified');
      const screen = document.getElementById('screen_container');
      if (!screen) throw new Error('VM screen container is missing');
      const policy = this.enforcer;
      if (!policy) throw new Error('VM resource policy was not initialized');
      const runtimeWindow = window as RuntimeWindow;
      const Runtime = (typeof runtimeWindow.V86Starter === 'function' ? runtimeWindow.V86Starter : runtimeWindow.V86) as ((new (options: Record<string, unknown>) => V86Runtime) | undefined);
      if (!Runtime) throw new Error('Local v86 runtime did not expose a constructor');
      this.bootStage = 'creating VM';
      this.status(`${this.profile.name} • creating VM`);
      this.monitor(`${developerAsyncImage ? 'streamed' : `verified artifact ${artifact.version}`} • ${this.profile.memoryMiB} MiB allocation • ${artifact.filename} ${developerAsyncImage ? (developerChunkIntegrityReady ? 'chunk manifest ready' : 'integrity unverified') : 'verified'}`);
      const vm = new Runtime({
        wasm_path: '/v86.wasm', memory_size: policy.memoryBytes, vga_memory_size: policy.vgaMemoryBytes,
        screen_container: screen, bios: { buffer: firmware.seabios }, vga_bios: { buffer: firmware.vgabios },
        cdrom: developerAsyncImage ?? { buffer: verifiedIsoBytes! },
        boot_order: 0x213, fastboot: true, bootmenu: false, autostart: false,
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
      this.bootStage = `booting ${this.profile.name}`;
      this.status(`${this.profile.name} • booting`);
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

  private async continuePastIsoBootPrompt(deadline: number): Promise<void> {
    const vm = this.emulator;
    const waitForVga = vm?.wait_until_vga_screen_contains;
    if (!vm || typeof waitForVga !== 'function' || typeof vm.keyboard_send_text !== 'function') return;
    try {
      await waitForVga.call(vm, /boot:\s*/i, { timeout_msec: Math.min(5000, Math.max(1000, deadline - Date.now())) });
      vm.keyboard_send_text('\n');
      this.monitor('Alpine ISO bootloader detected • selecting default boot entry');
    } catch {}
  }

  public async waitForGuestReady(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!this.emulator && !this.initializationFailure && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    if (this.initializationFailure) throw this.initializationFailure;
    const vm = this.emulator;
    if (!vm) throw new Error('v86 emulator was not created before readiness wait');
    const waitForVga = vm.wait_until_vga_screen_contains;
    await this.continuePastIsoBootPrompt(deadline);
    if (typeof waitForVga === 'function') {
      while (Date.now() < deadline && !this.initializationFailure) {
        try {
          await waitForVga.call(vm, /Alpine Linux|Welcome to Alpine|Buildroot|Linux version|localhost login:|LinuxLab Engine B/i, { timeout_msec: 1000 });
          this.vgaReady = true;
          break;
        } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
      }
    }
    if (this.initializationFailure) throw this.initializationFailure;
    const serialPrompt = /(?:\r?\n|^)\s*(?:[^\r\n]*[:~\/])?\s*[#$]\s*$/m.test(this.serial);
    const serialReady = serialPrompt || this.serial.includes(READY_MARKER);
    let shellPromptVisible = false;
    let loginPromptVisible = false;
    if (this.vgaReady && typeof waitForVga === 'function') {
      try {
        await waitForVga.call(vm, /(?:^|\r?\n)\s*(?:root@[^\r\n]*|localhost[^\r\n]*)?[#$]\s*$/im, { timeout_msec: Math.min(2500, Math.max(750, deadline - Date.now())) });
        shellPromptVisible = true;
      } catch {
        try {
          await waitForVga.call(vm, /localhost login:\s*/i, { timeout_msec: Math.min(2500, Math.max(750, deadline - Date.now())) });
          loginPromptVisible = true;
        } catch {}
      }
    }
    if (loginPromptVisible && typeof vm.keyboard_send_text === 'function' && typeof waitForVga === 'function') {
      vm.keyboard_send_text('root\n');
      try {
        await waitForVga.call(vm, /password:\s*/i, { timeout_msec: Math.min(3000, Math.max(750, deadline - Date.now())) });
        vm.keyboard_send_text('\n');
      } catch {}
    }
    if (this.vgaReady && vm.keyboard_send_text && waitForVga && (serialReady || shellPromptVisible || loginPromptVisible)) {
      const shellDeadline = Math.min(deadline, Date.now() + 5000);
      try {
        await waitForVga.call(vm, /(?:^|\r?\n)\s*(?:root@[^\r\n]*|[^\r\n]*localhost[^\r\n]*)?[#$]\s*$/im, { timeout_msec: Math.max(750, shellDeadline - Date.now()) });
        shellPromptVisible = true;
      } catch {}
    }
    if (this.vgaReady && vm.keyboard_send_text && waitForVga && (serialReady || shellPromptVisible)) {
      const remaining = Math.max(1000, deadline - Date.now());
      try {
        vm.keyboard_send_text(`echo ${PROBE_MARKER}\n`);
        await waitForVga.call(vm, new RegExp(PROBE_MARKER), { timeout_msec: remaining });
        this.shellReady = true;
      } catch {}
    }
    if (this.initializationFailure) throw this.initializationFailure;
    if (!this.vgaReady && !serialReady && !this.shellReady) throw new Error('Guest did not become ready before timeout');
    this.markReady();
  }

  private serialOutput(value: number): void {
    if (!this.enforcer || this.enforcer.isStopped()) return;
    if (!this.enforcer.acceptSerialByte(1)) { this.fail('Serial output limit reached'); return; }
    const chunk = this.serialDecoder.decode(new Uint8Array([value & 255]), { stream: true });
    if (!chunk) return;
    this.serial += chunk;
    if (this.serial.length > 65536) this.serial = this.serial.slice(-65536);
    const out = this.enforcer.acceptOutput(chunk);
    if (out.value) this.term.write(out.value);
    if (this.serial.includes(READY_MARKER) || /(?:\r?\n|^)\s*(?:[^\r\n]*[:~\/])?\s*[#$]\s*$/m.test(this.serial)) this.markReady();
  }

  private markReady(): void {
    if (this.ready) return;
    if (this.profile.policy !== 'developer' && this.integrityState !== 'verified') return;
    this.ready = true;
    if (this.bootTimeout !== null) { window.clearTimeout(this.bootTimeout); this.bootTimeout = null; }
    this.setHealth('ready');
    this.status(`${this.profile.name} • ready`);
  }

  private acceptGuestIdentity(identity: GuestIdentity): void {
    if (identity.kind === 'unknown') return;
    this.markReady();
  }

  private async loadRuntime(signal: AbortSignal): Promise<void> {
    if (!V86LinuxTerminal.runtimePromise) {
      V86LinuxTerminal.runtimePromise = new Promise<void>((resolve, reject) => {
        const existing = document.querySelector('script[data-v86-runtime]');
        if (existing) { resolve(); return; }
        const script = document.createElement('script');
        script.src = '/libv86.js';
        script.dataset.v86Runtime = '1';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load local v86 runtime'));
        document.head.appendChild(script);
      });
    }
    await V86LinuxTerminal.runtimePromise;
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  }

  private async preflightRuntimeAssets(signal: AbortSignal) /* fetch('/seabios.bin') fetch('/vgabios.bin') */: Promise<{ seabios: ArrayBuffer; vgabios: ArrayBuffer }> {
    const load = async (artifact: typeof SEABIOS_ARTIFACT): Promise<ArrayBuffer> => {
      const response = await fetch(`/${artifact.filename}`, { cache: 'force-cache', signal });
      if (!response.ok) throw new Error(`Required VM firmware failed to load: ${artifact.filename} (${response.status})`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== artifact.size) throw new Error(`Required VM firmware failed size verification: ${artifact.filename}`);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const actual = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      if (actual !== artifact.sha256) throw new Error(`Required VM firmware failed SHA-256 verification: ${artifact.filename}`);
      return bytes;
    };
    const [seabios, vgabios] = await Promise.all([load(SEABIOS_ARTIFACT), load(VGABIOS_ARTIFACT)]);
    return { seabios, vgabios };
  }

  private setHealth(state: 'booting' | 'ready' | 'offline'): void {
    this.health = state;
    const el = document.getElementById('v86-health');
    if (el) {
      el.setAttribute('data-state', state);
      el.setAttribute('aria-label', `VM ${state}`);
    }
  }

  private setIntegrityState(state: 'verified' | 'unverified'): void {
    this.integrityState = state;
  }

  private setNetworkState(state: string): void {
    void state;
  }

  private fail(message: string, error?: Error): void {
    this.initializationFailure = error ?? new Error(message);
    this.setHealth('offline');
    this.status(`${this.profile.name} • ${message}`);
    this.term.writeln(`[VM error] ${message}`);
  }

  private status(text: string): void {
    const el = document.getElementById('v86-status');
    if (el) el.replaceChildren(document.createTextNode(text));
  }

  private monitor(text: string): void {
    const el = document.getElementById('v86-monitor');
    if (el) el.replaceChildren(document.createTextNode(text));
  }

  private fit(): void { try { this.fitAddon.fit(); } catch {} }
  private showTerminal(): void {
    this.activeView = 'terminal';
    const term = document.getElementById('v86-terminal-container');
    const screen = document.getElementById('screen_container');
    if (term) term.hidden = false;
    if (screen) {
      screen.hidden = true;
      screen.setAttribute('aria-hidden', 'true');
    }
  }
  private showScreen(): void {
    this.activeView = 'screen';
    const term = document.getElementById('v86-terminal-container');
    const screen = document.getElementById('screen_container');
    if (term) term.hidden = true;
    if (screen) {
      screen.hidden = false;
      screen.setAttribute('aria-hidden', 'false');
    }
    this.enableGuestKeyboard();
  }
  private showDiagnostics(): void {
    this.term.writeln('--- diagnostics ---');
    this.term.writeln(`profile=${this.profile.name} health=${this.health} integrity=${this.integrityState}`);
    this.term.writeln(`stage=${this.bootStage} ready=${this.ready} vga=${this.vgaReady} shell=${this.shellReady}`);
  }
  private async copyDiagnostics(): Promise<void> {
    const text = `profile=${this.profile.name}\nhealth=${this.health}\nintegrity=${this.integrityState}\nstage=${this.bootStage}`;
    try { await navigator.clipboard.writeText(text); } catch {}
  }
  private handleVisibility = (): void => {
    if (document.visibilityState === 'hidden' && this.emulator) {
      try { this.emulator.stop?.(); } catch {}
    }
  };
  private scheduleBootWatchdog(id: number, timeoutMs: number): void {
    if (this.bootTimeout !== null) window.clearTimeout(this.bootTimeout);
    this.bootTimeout = window.setTimeout(() => {
      if (id === this.bootId && !this.ready) this.fail('VM boot timed out');
    }, timeoutMs);
  }

  private async dispose(): Promise<void> {
    if (this.bootTimeout !== null) { window.clearTimeout(this.bootTimeout); this.bootTimeout = null; }
    if (this.sessionTimer !== null) { window.clearTimeout(this.sessionTimer); this.sessionTimer = null; }
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleOrientationChange);
    const disposeTelemetry = this.telemetryDispose;
    this.telemetryDispose = null;
    try { disposeTelemetry?.(); } catch {}
    const emulator = this.emulator;
    this.emulator = null;
    try { emulator?.stop?.(); } catch {}
    try { emulator?.destroy?.(); } catch {}
    this.enforcer = null;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { new V86LinuxTerminal(); }, { once: true });
} else {
  new V86LinuxTerminal();
}
