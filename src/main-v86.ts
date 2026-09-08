import * as xtermModule from '@xterm/xterm';
import * as fitModule from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const TerminalConstructor = (xtermModule as any).Terminal || (xtermModule as any).default?.Terminal || (xtermModule as any).default || xtermModule;
const FitAddonConstructor = (fitModule as any).FitAddon || (fitModule as any).default?.FitAddon || (fitModule as any).default || fitModule;

type VMState = 'stopped' | 'loading' | 'booting' | 'ready' | 'error';
type BootProfile = { name: string; iso: string; memoryMiB: number };

const ISO_STREAM_ENDPOINT = '/api/iso';

export class V86LinuxTerminal {
  private term: any = null;
  private fitAddon: any = null;
  private emulator: any = null;
  private readonly containerId: string;
  private resizeObserver: ResizeObserver | null = null;
  private resizeDebounceTimer: number | null = null;
  private state: VMState = 'stopped';
  private shellReady = false;
  private serialBuffer = '';
  private progressTimer: number | null = null;
  private monitorTimer: number | null = null;
  private gccSetupStarted = false;
  private bootStartedAt = 0;
  private lastOutputAt = 0;
  private bootGeneration = 0;
  private bootPromise: Promise<void> | null = null;
  private currentProfile: BootProfile = { name: 'Alpine Linux (Developer)', iso: ISO_STREAM_ENDPOINT, memoryMiB: 1024 };
  private static v86LoadPromise: Promise<void> | null = null;

  private assetUrl(path: string): string { return new URL(path, document.baseURI).toString(); }

  constructor(containerId = 'v86-terminal-container') {
    this.containerId = containerId;
    this.initTerminal();
    this.bindExternalButtons();
  }

  private initTerminal(): void {
    const container = document.getElementById(this.containerId);
    if (!container) throw new Error(`Missing #${this.containerId}`);
    container.style.cssText += ';width:100%;height:100%;position:relative;display:block;overflow:hidden';
    this.term = new TerminalConstructor({
      cursorBlink: true, fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", "Courier New", monospace',
      theme: { background: '#04060a', foreground: '#38bdf8', cursor: '#38bdf8', selectionBackground: '#1e3a8a' },
      convertEol: true, scrollback: 10000
    });
    this.fitAddon = new FitAddonConstructor();
    this.term.loadAddon(this.fitAddon);
    this.term.open(container);
    window.setTimeout(() => this.fit(), 50);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleViewportResize());
      this.resizeObserver.observe(container);
    }
    window.addEventListener('resize', this.onWindowResize);
    this.term.onData((data: string) => {
      if (!this.emulator) return;
      this.sendSerial(data);
    });
    container.addEventListener('click', () => this.term?.focus());
  }

  private onWindowResize = (): void => this.handleViewportResize();
  private handleViewportResize(): void {
    if (this.resizeDebounceTimer !== null) window.clearTimeout(this.resizeDebounceTimer);
    this.resizeDebounceTimer = window.setTimeout(() => this.fit(), 50);
  }
  public fit(): void { try { this.fitAddon?.fit(); } catch {} }
  public sendMobileInput(data: string): void { this.term?.focus(); this.sendSerial(data); }
  private writeLine(text: string): void { try { this.term?.writeln(text); } catch { console.log(text); } }

  private bindExternalButtons(): void {
    document.getElementById('btn-v86-restart')?.addEventListener('click', () => void this.restart());
    document.getElementById('btn-v86-alpine')?.addEventListener('click', () => void this.bootAlpine(true));
    document.getElementById('btn-v86-fallback')?.addEventListener('click', () => void this.bootQuick());
    document.getElementById('btn-v86-gcc')?.addEventListener('click', () => this.requestGcc());
    const network = document.getElementById('btn-v86-network') as HTMLButtonElement | null;
    if (network) { network.disabled = true; network.textContent = '🌐 Network unavailable'; network.title = 'Networking is intentionally disabled in the disposable browser VM.'; }
  }

  private setStatus(text: string): void { const el = document.getElementById('v86-status'); if (el) el.textContent = text; }
  private setMonitor(text: string): void { const el = document.getElementById('v86-monitor'); if (el) el.textContent = text; }

  public async boot(): Promise<void> { await this.bootAlpine(false); }
  public async bootAlpine(force = true): Promise<void> {
    await this.startProfile({ name: 'Alpine Linux (Developer)', iso: ISO_STREAM_ENDPOINT, memoryMiB: 1024 }, force);
  }
  public async bootQuick(): Promise<void> {
    await this.startProfile({ name: 'Alpine Linux (Quick)', iso: ISO_STREAM_ENDPOINT, memoryMiB: 256 }, true);
  }

  private async startProfile(profile: BootProfile, force: boolean): Promise<void> {
    if (!force && this.emulator && this.state !== 'error') { this.term?.focus(); return; }
    if (this.bootPromise) {
      this.bootGeneration++;
      try { await this.bootPromise; } catch {}
    }
    const generation = ++this.bootGeneration;
    this.bootPromise = this.startProfileInternal(profile, generation).finally(() => {
      if (generation === this.bootGeneration) this.bootPromise = null;
    });
    return this.bootPromise;
  }

  private async startProfileInternal(profile: BootProfile, generation: number): Promise<void> {
    this.stopTimers();
    await this.destroyEmulator();
    if (generation !== this.bootGeneration) return;

    this.currentProfile = profile;
    this.state = 'loading';
    this.shellReady = false;
    this.serialBuffer = '';
    this.gccSetupStarted = false;
    this.bootStartedAt = performance.now();
    this.lastOutputAt = this.bootStartedAt;
    this.term?.clear();
    this.writeLine('\x1b[1;36m============================================================\x1b[0m');
    this.writeLine(`\x1b[1;32m LinuxLab — ${profile.name}\x1b[0m`);
    this.writeLine('\x1b[36mLoading a disposable Alpine Linux VM in this browser.\x1b[0m');
    this.setStatus(`${profile.name} • loading`);
    this.setMonitor(`RAM allocation: ${profile.memoryMiB} MiB • guest network disabled`);

    try {
      await this.loadScript();
      if (generation !== this.bootGeneration) return;
      const V86Starter = (window as any).V86Starter;
      if (!V86Starter) throw new Error('v86 runtime loaded but V86Starter was not exported');
      const screen = document.getElementById('screen_container');
      if (!screen) throw new Error('Missing #screen_container');

      const options = {
        wasm_path: this.assetUrl('v86.wasm'),
        memory_size: profile.memoryMiB * 1024 * 1024,
        vga_memory_size: 8 * 1024 * 1024,
        bios: { url: this.assetUrl('seabios.bin') },
        vga_bios: { url: this.assetUrl('vgabios.bin') },
        cdrom: { url: profile.iso, async: true },
        screen_container: screen,
        autostart: true,
        disable_speaker: true,
        disable_keyboard: false,
        disable_mouse: true,
      };

      const emulator = new V86Starter(options);
      if (generation !== this.bootGeneration) { try { emulator.stop?.(); emulator.destroy?.(); } catch {} return; }
      this.emulator = emulator;
      emulator.add_listener('serial0-output-byte', (byte: number) => {
        if (generation === this.bootGeneration) this.handleSerialByte(byte);
      });
      this.state = 'booting';
      this.progressTimer = window.setInterval(() => this.reportBootProgress(), 5000);
      this.monitorTimer = window.setInterval(() => this.updateUsageMonitor(), 1000);
      this.fit();
      this.term?.focus();
    } catch (error: any) {
      if (generation === this.bootGeneration) await this.handleBootError(error?.message || String(error));
    }
  }

  private handleSerialByte(byte: number): void {
    const char = String.fromCharCode(byte & 0xff);
    this.lastOutputAt = performance.now();
    this.serialBuffer = (this.serialBuffer + char).slice(-16000);
    this.term?.write(char);
    const visible = this.stripAnsi(this.serialBuffer);
    if (!this.shellReady && (/No space left on device/i.test(visible) || /emergency recovery shell/i.test(visible))) {
      void this.handleBootError('Alpine failed during boot. The boot image or writable overlay needs rebuilding.');
      return;
    }
    if (!this.shellReady && this.isShellPrompt(visible)) this.markReady();
  }

  private isShellPrompt(text: string): boolean {
    const lines = text.replace(/\r/g, '\n').split('\n').map(line => line.trim()).filter(Boolean).slice(-20);
    return lines.some(line => /(?:^|\s)(?:[\w.-]+@)?[\w.-]+:[^\n]*[#$>]$/.test(line) || /^(?:~|\/|\.)?[^\s]*[#$>]$/.test(line));
  }

  private markReady(): void {
    if (this.shellReady) return;
    this.shellReady = true;
    this.state = 'ready';
    this.stopTimers();
    this.setStatus(`${this.currentProfile.name} • ready`);
    this.setMonitor(`RAM allocation: ${this.memoryMiB()} MiB • guest network disabled • ready`);
    const cols = this.term?.cols || 120;
    const rows = this.term?.rows || 30;
    window.setTimeout(() => {
      if (!this.shellReady) return;
      this.sendSerial(`stty cols ${cols} rows ${rows}; export TERM=xterm-256color LINES=${rows} COLUMNS=${cols}; clear\r`);
      this.checkGccToolchain();
    }, 300);
  }

  public requestGcc(): void {
    this.term?.focus();
    if (!this.shellReady) { this.writeLine('\r\n\x1b[33m[GCC] VM is still booting.\x1b[0m'); return; }
    this.checkGccToolchain();
  }
  private checkGccToolchain(): void {
    if (!this.shellReady || !this.emulator || this.gccSetupStarted) return;
    this.gccSetupStarted = true;
    this.sendSerial('echo "[LinuxLab] Checking GCC..."; command -v gcc >/dev/null 2>&1 && gcc --version || echo "[LinuxLab] GCC is not installed in this image"\r');
  }
  private sendSerial(data: string): void {
    if (!this.emulator || typeof this.emulator.serial0_send !== 'function') return;
    try { this.emulator.serial0_send(data); } catch (error) { this.writeLine(`\r\n\x1b[31m[Serial Error] ${String(error)}\x1b[0m`); }
  }

  public async restart(): Promise<void> { await this.bootAlpine(true); }
  public async destroy(): Promise<void> {
    this.bootGeneration++;
    this.stopTimers();
    if (this.resizeDebounceTimer !== null) window.clearTimeout(this.resizeDebounceTimer);
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.onWindowResize);
    await this.destroyEmulator();
    this.state = 'stopped';
    this.shellReady = false;
    this.setStatus('stopped');
  }
  private async destroyEmulator(): Promise<void> {
    const emulator = this.emulator;
    this.emulator = null;
    this.shellReady = false;
    if (!emulator) return;
    try { if (typeof emulator.stop === 'function') emulator.stop(); } catch {}
    try { if (typeof emulator.destroy === 'function') emulator.destroy(); } catch {}
  }

  private reportBootProgress(): void {
    if (!this.emulator || this.shellReady || this.state === 'error') return;
    const elapsed = Math.round((performance.now() - this.bootStartedAt) / 1000);
    const silent = Math.round((performance.now() - this.lastOutputAt) / 1000);
    if (silent >= 20) this.writeLine(`\x1b[33m[Boot monitor] ${elapsed}s elapsed; waiting for guest output...\x1b[0m`);
    this.setMonitor(`RAM allocation: ${this.memoryMiB()} MiB • Boot: ${elapsed}s • guest network disabled`);
  }
  private updateUsageMonitor(): void {
    if (!this.emulator || this.state === 'error') return;
    const elapsed = Math.round((performance.now() - this.bootStartedAt) / 1000);
    this.setMonitor(`RAM allocation: ${this.memoryMiB()} MiB • Boot: ${elapsed}s • ${this.shellReady ? 'ready' : 'booting'}`);
  }
  private memoryMiB(): number { return this.currentProfile.memoryMiB; }

  private async handleBootError(message: string): Promise<void> {
    if (this.state === 'error') return;
    this.stopTimers();
    this.state = 'error';
    this.writeLine(`\r\n\x1b[1;31m[VM Boot Error] ${message}\x1b[0m`);
    this.setStatus(`${this.currentProfile.name} • error`);
    this.setMonitor('boot error');
    await this.destroyEmulator();
  }
  private stopTimers(): void {
    if (this.progressTimer !== null) { window.clearInterval(this.progressTimer); this.progressTimer = null; }
    if (this.monitorTimer !== null) { window.clearInterval(this.monitorTimer); this.monitorTimer = null; }
  }
  private stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  private loadScript(): Promise<void> {
    if ((window as any).V86Starter) return Promise.resolve();
    if (V86LinuxTerminal.v86LoadPromise) return V86LinuxTerminal.v86LoadPromise;
    V86LinuxTerminal.v86LoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-linuxlab-v86]') as HTMLScriptElement | null;
      const script = existing || document.createElement('script');
      const finish = () => (window as any).V86Starter ? resolve() : reject(new Error('libv86.js loaded without V86Starter'));
      script.addEventListener('load', finish, { once: true });
      script.addEventListener('error', () => reject(new Error('Failed to load libv86.js')), { once: true });
      if (!existing) {
        script.src = this.assetUrl('libv86.js');
        script.async = true;
        script.dataset.linuxlabV86 = 'true';
        document.head.appendChild(script);
      } else if ((window as any).V86Starter) {
        resolve();
      }
    }).catch(error => {
      V86LinuxTerminal.v86LoadPromise = null;
      throw error;
    });
    return V86LinuxTerminal.v86LoadPromise;
  }
}
