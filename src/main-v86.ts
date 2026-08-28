import * as xtermModule from '@xterm/xterm';
import * as fitModule from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const TerminalConstructor =
  (xtermModule as any).Terminal ||
  (xtermModule as any).default?.Terminal ||
  (xtermModule as any).default ||
  xtermModule;

const FitAddonConstructor =
  (fitModule as any).FitAddon ||
  (fitModule as any).default?.FitAddon ||
  (fitModule as any).default ||
  fitModule;

type VMState =
  | 'stopped'
  | 'loading'
  | 'booting'
  | 'ready'
  | 'error';

type AlpineLoginState =
  | 'waiting'
  | 'login-detected'
  | 'username-sent'
  | 'ready';

type BootProfile = {
  name: string;
  iso: string;
  fallback?: boolean;
};

const GITHUB_RELEASE_ISO_URL =
  'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso';

export class V86LinuxTerminal {
  private term: any = null;
  private fitAddon: any = null;
  private emulator: any = null;

  private readonly containerId: string;
  private resizeObserver: ResizeObserver | null = null;
  private resizeDebounceTimer: number | null = null;

  private state: VMState = 'stopped';
  private shellReady = false;
  private bootPromptHandled = false;
  private guestTtyConfigured = false;

  private alpineLoginState: AlpineLoginState = 'waiting';

  private serialBuffer = '';
  private decoder = new TextDecoder('utf-8');

  private bootTimer: number | null = null;
  private progressTimer: number | null = null;

  private gccRequested = false;
  private gccSetupStarted = false;

  private bootStartedAt = 0;
  private lastOutputAt = 0;

  private readonly GUEST_MEMORY_BYTES = 1024 * 1024 * 1024;

  private currentProfile: BootProfile = {
    name: 'Alpine Linux',
    iso: GITHUB_RELEASE_ISO_URL,
  };

  private assetUrl(path: string): string {
    return new URL(path, document.baseURI).toString();
  }

  constructor(containerId = 'v86-terminal-container') {
    this.containerId = containerId;
    this.initTerminal();
    this.bindExternalButtons();
  }

  // ========================================================================
  // TERMINAL SETUP & VIEWPORT SIZING
  // ========================================================================

  private initTerminal(): void {
    const container = document.getElementById(this.containerId);

    if (!container) {
      console.error(`[LinuxLab] Missing #${this.containerId}`);
      return;
    }

    container.style.width = '100%';
    container.style.height = '100%';
    container.style.position = 'relative';
    container.style.display = 'block';
    container.style.overflow = 'hidden';

    this.term = new TerminalConstructor({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", "Courier New", monospace',
      theme: {
        background: '#04060a',
        foreground: '#38bdf8',
        cursor: '#38bdf8',
        selectionBackground: '#1e3a8a',
      },
      convertEol: true,
      scrollback: 10000,
      allowTransparency: false,
    });

    this.fitAddon = new FitAddonConstructor();
    this.term.loadAddon(this.fitAddon);
    this.term.open(container);

    window.setTimeout(() => this.fit(), 50);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleViewportResize();
      });
      this.resizeObserver.observe(container);
    }

    window.addEventListener('resize', this.onWindowResize);

    // ======================================================================
    // KEYBOARD INPUT
    // ======================================================================

    this.term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        if (event.type === 'keydown') {
          this.sendSerial('\t');
        }
        return false;
      }

      if (
        event.ctrlKey &&
        ['c', 'd', 'z', 'l', 'o', 'x', 'w', 'k', 'u', 'r', 'g', 'j', 't'].includes(
          event.key.toLowerCase(),
        )
      ) {
        if (event.type === 'keydown') {
          const code = event.key.toLowerCase().charCodeAt(0) - 96;
          if (code > 0 && code < 32) {
            this.sendSerial(String.fromCharCode(code));
          }
        }
        return false;
      }

      return true;
    });

    this.term.onData((data: string) => {
      if (!this.emulator) {
        this.writeLine('\r\n\x1b[33m[Terminal] VM is not running.\x1b[0m');
        return;
      }
      this.sendSerial(data);
    });

    container.addEventListener('click', () => {
      this.term?.focus();
    });
  }

  private onWindowResize = (): void => {
    this.handleViewportResize();
  };

  private handleViewportResize(): void {
    if (this.resizeDebounceTimer !== null) {
      window.clearTimeout(this.resizeDebounceTimer);
    }

    this.resizeDebounceTimer = window.setTimeout(() => {
      this.fit();
    }, 50);
  }

  public fit(): void {
    try {
      this.fitAddon?.fit();
    } catch {
      // Safe layout transition
    }
  }

  private writeLine(text: string): void {
    try {
      this.term?.writeln(text);
    } catch {
      console.log(text);
    }
  }

  // ========================================================================
  // BUTTON ACTIONS
  // ========================================================================

  private bindExternalButtons(): void {
    document
      .getElementById('btn-v86-restart')
      ?.addEventListener('click', () => {
        void this.restart();
      });

    document
      .getElementById('btn-v86-alpine')
      ?.addEventListener('click', () => {
        void this.bootAlpine(true);
      });

    document
      .getElementById('btn-v86-fallback')
      ?.addEventListener('click', () => {
        void this.bootLinux4();
      });

    document
      .getElementById('btn-v86-gcc')
      ?.addEventListener('click', () => {
        this.requestGcc();
      });
  }

  private setStatus(text: string): void {
    const el = document.getElementById('v86-status');
    if (el) {
      el.textContent = text;
    }
  }

  // ========================================================================
  // BOOT PROFILES
  // ========================================================================

  public async boot(): Promise<void> {
    await this.bootAlpine(false);
  }

  public async bootAlpine(force = true): Promise<void> {
    await this.startProfile(
      {
        name: 'Alpine Linux',
        iso: GITHUB_RELEASE_ISO_URL,
      },
      force,
    );
  }

  public async bootLinux4(): Promise<void> {
    await this.startProfile(
      {
        name: 'Linux4',
        iso: './linux4.iso',
        fallback: true,
      },
      true,
    );
  }

  private async startProfile(profile: BootProfile, force: boolean): Promise<void> {
    if (!force && this.emulator && this.state !== 'error') {
      this.term?.focus();
      return;
    }

    this.stopTimers();
    this.destroyEmulator();

    this.currentProfile = profile;
    this.state = 'loading';
    this.shellReady = false;
    this.bootPromptHandled = false;
    this.guestTtyConfigured = false;
    this.alpineLoginState = 'waiting';
    this.serialBuffer = '';
    this.gccSetupStarted = false;
    this.bootStartedAt = performance.now();
    this.lastOutputAt = this.bootStartedAt;

    try {
      this.term?.clear();
    } catch {
      // Ignore
    }

    this.writeLine('\x1b[1;36m============================================================\x1b[0m');
    this.writeLine(`\x1b[1;32m LinuxLab Engine B — ${profile.name}\x1b[0m`);
    this.writeLine('\x1b[36m Preferred full Linux environment\x1b[0m');
    this.writeLine(`Boot image: \x1b[33m${profile.iso}\x1b[0m`);
    this.writeLine('');

    const relay = this.getRelay();
    if (relay) {
      this.writeLine(`\x1b[36mNetwork relay enabled: ${relay}\x1b[0m`);
    } else {
      this.writeLine('\x1b[33mNetwork relay disabled. Add ?relay=wss://... for guest networking.\x1b[0m');
    }

    this.writeLine('\x1b[90mWaiting for the guest shell. Maximum wait: 120s.\x1b[0m');
    this.writeLine('\x1b[90mISOLINUX "boot:" is normal and will be handled automatically.\x1b[0m');

    this.setStatus(`${profile.name} • booting`);

    try {
      await this.loadScript();

      const V86Starter = (window as any).V86Starter || (window as any).V86;
      if (!V86Starter) {
        throw new Error('v86 runtime was not found at /libv86.js');
      }

      const screen = document.getElementById('screen_container');
      if (!screen) {
        throw new Error('Missing #screen_container');
      }

      const options: any = {
        wasm_path: this.assetUrl('v86.wasm'),
        memory_size: this.GUEST_MEMORY_BYTES,
        vga_memory_size: 8 * 1024 * 1024,
        bios: {
          url: this.assetUrl('seabios.bin'),
        },
        vga_bios: {
          url: this.assetUrl('vgabios.bin'),
        },
        cdrom: {
          url: profile.iso,
          async: false,
        },
        screen_container: screen,
        autostart: true,
        disable_speaker: true,
        disable_keyboard: false,
        disable_mouse: true,
      };

      if (relay) {
        options.network_relay_url = relay;
      }

      this.emulator = new V86Starter(options);

      this.emulator.add_listener('serial0-output-byte', (byte: number) => {
        this.handleSerialByte(byte);
      });

      this.state = 'booting';
      this.lastOutputAt = performance.now();
      this.bootTimer = null;

      this.progressTimer = window.setInterval(() => {
        this.reportBootProgress();
      }, 15_000);

      this.fit();
      this.term?.focus();
    } catch (error: any) {
      this.handleBootError(error?.message || String(error));
    }
  }

  // ========================================================================
  // SERIAL RECEIVER & PROMPT PARSER
  // ========================================================================

  private handleSerialByte(byte: number): void {
    let char = '';

    try {
      char = this.decoder.decode(new Uint8Array([byte]), { stream: true });
    } catch {
      char = String.fromCharCode(byte);
    }

    if (!char) {
      return;
    }

    this.lastOutputAt = performance.now();
    this.serialBuffer = (this.serialBuffer + char).slice(-16000);

    try {
      this.term?.write(char);
    } catch {
      // Ignore
    }

    const visible = this.stripAnsi(this.serialBuffer);

    if (
      !this.shellReady &&
      this.currentProfile.iso === GITHUB_RELEASE_ISO_URL &&
      /No space left on device|write error: No space left on device|Loading user settings .*apkovl.* failed|emergency recovery shell/i.test(
        visible,
      )
    ) {
      this.handleAlpineStorageFailure();
      return;
    }

    if (!this.shellReady && this.isShellPrompt(visible)) {
      this.markReady();
      return;
    }

    if (!this.bootPromptHandled && /(?:^|\n)\s*boot:\s*$/im.test(visible)) {
      this.bootPromptHandled = true;
      this.writeLine(
        '\x1b[1;36m[Bootloader] ISOLINUX boot prompt detected. Starting default entry...\x1b[0m',
      );

      window.setTimeout(() => {
        if (!this.shellReady && this.emulator) {
          this.sendSerial('\r');
        }
      }, 250);
    }

    if (
      this.currentProfile.iso === GITHUB_RELEASE_ISO_URL &&
      !this.shellReady &&
      this.alpineLoginState === 'waiting' &&
      /(?:^|\n)\s*(?:localhost\s+)?login:\s*$/im.test(visible)
    ) {
      this.alpineLoginState = 'login-detected';
      this.writeLine(
        '\x1b[36m[Alpine] Login prompt detected. Sending username root once...\x1b[0m',
      );

      if (!this.shellReady && this.emulator) {
        this.alpineLoginState = 'username-sent';
        this.sendAutomaticLogin('root\r');
      }
    }

    if (/mounting host9p on \/mnt failed/i.test(visible)) {
      if (!this.serialBuffer.includes('[LinuxLab] Host /mnt sharing is unavailable')) {
        this.writeLine(
          '\x1b[33m[LinuxLab] Host /mnt sharing is unavailable; Linux boot can continue normally.\x1b[0m',
        );
      }
    }

    if (!this.shellReady && this.isShellPrompt(this.stripAnsi(this.serialBuffer))) {
      this.markReady();
    }
  }

  private handleAlpineStorageFailure(): void {
    if (this.state === 'error') {
      return;
    }

    this.stopTimers();
    this.state = 'error';

    this.writeLine('');
    this.writeLine(
      '\x1b[1;31m[Alpine] Boot failed: localhost.apkovl.tar.gz could not be unpacked because writable guest storage is full.\x1b[0m',
    );
    this.writeLine(
      '\x1b[33m[Alpine] Engine B is using 1 GiB guest RAM. If this persists, reduce the apkovl size or increase guest RAM further.\x1b[0m',
    );
    this.writeLine(
      '\x1b[90m[Alpine] The emergency "~ #" prompt is not treated as a normal login shell.\x1b[0m',
    );

    this.setStatus(`${this.currentProfile.name} • storage/initramfs error`);
  }

  private isShellPrompt(text: string): boolean {
    const lines = text
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-30);

    for (const line of lines) {
      if (/^localhost:[^\n]*[%#$>]$/.test(line)) return true;
      if (/^[A-Za-z0-9._-]+:[^\n]*[%#$>]$/.test(line)) return true;
      if (/^\(none\):[^\n]*[%#$>]$/.test(line)) return true;
      if (/^[\w.-]+@[\w.-]+:[^\n]*[%#$>]$/.test(line)) return true;
      if (/^(?:~|\.|\/)[^\s]*[%#$>]$/.test(line)) return true;
      if (/^[%#$>]$/.test(line)) return true;
    }

    return false;
  }

  // ========================================================================
  // SHELL READY INITIALIZATION
  // ========================================================================

  private markReady(): void {
    if (this.shellReady) {
      return;
    }

    this.shellReady = true;
    this.state = 'ready';
    this.alpineLoginState = 'ready';

    this.stopTimers();

    const elapsed = ((performance.now() - this.bootStartedAt) / 1000).toFixed(1);
    this.setStatus(`${this.currentProfile.name} • ready`);

    this.fit();

    if (!this.guestTtyConfigured) {
      this.guestTtyConfigured = true;
      const cols = this.term?.cols || 120;
      const rows = this.term?.rows || 30;

      window.setTimeout(() => {
        this.sendSerial(
          `stty cols ${cols} rows ${rows}; export TERM=xterm-256color LINES=${rows} COLUMNS=${cols}; clear\r`,
        );
        this.term?.focus();
      }, 300);
    }

    if (this.gccRequested && this.currentProfile.iso === GITHUB_RELEASE_ISO_URL) {
      this.gccRequested = false;
      window.setTimeout(() => {
        if (this.shellReady && this.currentProfile.iso === GITHUB_RELEASE_ISO_URL) {
          this.installGcc();
        }
      }, 800);
    }
  }

  // ========================================================================
  // GCC MANAGEMENT
  // ========================================================================

  public requestGcc(): void {
    this.term?.focus();

    if (!this.emulator) {
      this.gccRequested = true;
      this.writeLine('\r\n\x1b[33m[GCC] Starting Alpine first; GCC request queued.\x1b[0m');
      void this.bootAlpine(true);
      return;
    }

    if (this.currentProfile.iso !== GITHUB_RELEASE_ISO_URL) {
      this.gccRequested = true;
      this.writeLine('\r\n\x1b[36m[GCC] Switching to Alpine Linux...\x1b[0m');
      void this.bootAlpine(true);
      return;
    }

    if (!this.shellReady) {
      this.gccRequested = true;
      this.writeLine('\r\n\x1b[33m[GCC] Alpine is still booting. Request queued.\x1b[0m');
      return;
    }

    this.installGcc();
  }

  private installGcc(): void {
    if (!this.shellReady || !this.emulator) {
      this.gccRequested = true;
      return;
    }

    if (this.gccSetupStarted) {
      this.writeLine('\r\n\x1b[36m[GCC] GCC check is already running.\x1b[0m');
      return;
    }

    this.gccSetupStarted = true;
    this.writeLine('\r\n\x1b[1;36m[GCC] Checking the real Alpine GCC toolchain...\x1b[0m');

    this.sendCommand(
      'if command -v gcc >/dev/null 2>&1; then echo "[LinuxLab] GCC available"; gcc --version; else echo "[LinuxLab] GCC is not installed in this Alpine image"; if command -v apk >/dev/null 2>&1; then echo "[LinuxLab] Attempting build-base installation..."; apk add --no-cache build-base && gcc --version || echo "[LinuxLab] GCC installation failed"; else echo "[LinuxLab] apk is unavailable"; fi; fi',
    );
  }

  // ========================================================================
  // SERIAL SEND & COMMAND EXECUTION
  // ========================================================================

  public sendCommand(command: string): void {
    if (!this.emulator || !this.shellReady) {
      this.writeLine(
        `\r\n\x1b[33m[Terminal] Shell is not ready; command not sent: ${command}\x1b[0m`,
      );
      return;
    }

    this.sendSerial(`${command}\r`);
  }

  private sendAutomaticLogin(data: string): void {
    if (this.shellReady) {
      return;
    }

    if (
      this.alpineLoginState !== 'login-detected' &&
      this.alpineLoginState !== 'username-sent'
    ) {
      return;
    }

    if (data !== 'root\r') {
      return;
    }

    this.sendSerial(data);
  }

  private sendSerial(data: string): void {
    if (!this.emulator || typeof this.emulator.serial0_send !== 'function') {
      return;
    }

    if (data === 'root\r' && (this.shellReady || this.alpineLoginState === 'ready')) {
      return;
    }

    try {
      this.emulator.serial0_send(data);
    } catch (error) {
      this.writeLine(`\r\n\x1b[1;31m[Serial Error] ${String(error)}\x1b[0m`);
    }
  }

  // ========================================================================
  // TEARDOWN & RESTART
  // ========================================================================

  public async restart(): Promise<void> {
    const keepGcc = this.gccRequested;
    const profile = this.currentProfile.iso === './linux4.iso' ? 'linux4' : 'alpine';

    this.writeLine('\r\n\x1b[1;33m[Restarting Virtual Machine...]\x1b[0m');
    this.gccRequested = keepGcc;

    if (profile === 'linux4') {
      await this.bootLinux4();
    } else {
      await this.bootAlpine(true);
    }
  }

  public destroy(): void {
    this.stopTimers();
    if (this.resizeDebounceTimer !== null) {
      window.clearTimeout(this.resizeDebounceTimer);
      this.resizeDebounceTimer = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    window.removeEventListener('resize', this.onWindowResize);

    this.destroyEmulator();
    this.state = 'stopped';
    this.shellReady = false;
    this.guestTtyConfigured = false;
    this.alpineLoginState = 'waiting';
    this.serialBuffer = '';
    this.gccSetupStarted = false;

    this.term?.clear();
    this.setStatus('stopped');
  }

  private destroyEmulator(): void {
    if (!this.emulator) {
      return;
    }

    try {
      this.emulator.stop?.();
    } catch {
      // Ignore
    }

    try {
      this.emulator.destroy?.();
    } catch {
      // Ignore
    }

    this.emulator = null;
  }

  private reportBootProgress(): void {
    if (!this.emulator || this.shellReady) {
      return;
    }

    const elapsed = Math.round((performance.now() - this.bootStartedAt) / 1000);
    const silent = Math.round((performance.now() - this.lastOutputAt) / 1000);

    if (silent >= 10) {
      this.writeLine(
        `\x1b[33m[Boot monitor] ${elapsed}s elapsed; guest is still allowed to boot.\x1b[0m`,
      );
    }
  }

  private handleBootError(message: string): void {
    this.stopTimers();
    this.writeLine(`\r\n\x1b[1;31m[VM Boot Error] ${message}\x1b[0m`);
    this.state = 'error';
    this.setStatus(`${this.currentProfile.name} • error`);
  }

  private stopTimers(): void {
    if (this.bootTimer !== null) {
      window.clearTimeout(this.bootTimer);
      this.bootTimer = null;
    }

    if (this.progressTimer !== null) {
      window.clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  private getRelay(): string | null {
    try {
      const params = new URLSearchParams(window.location.search);
      const relay = params.get('relay');

      if (relay && /^wss?:\/\//i.test(relay)) {
        return relay;
      }

      return null;
    } catch {
      return null;
    }
  }

  private stripAnsi(text: string): string {
    return text
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
      .replace(/\x1b./g, '')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  private loadScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as any).V86Starter || (window as any).V86) {
        resolve();
        return;
      }

      const existing = document.querySelector(
        'script[data-linuxlab-v86]',
      ) as HTMLScriptElement | null;

      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => reject(new Error('Failed to load libv86.js.')),
          { once: true },
        );
        return;
      }

      const script = document.createElement('script');
      script.src = this.assetUrl('libv86.js');
      script.async = true;
      script.dataset.linuxlabV86 = 'true';
      script.onload = () => resolve();
      script.onerror = () =>
        reject(
          new Error('Failed to load libv86.js from the application assets.'),
        );

      document.head.appendChild(script);
    });
  }
}
