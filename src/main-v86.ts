import * as xtermModule from '@xterm/xterm';
import * as fitModule from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const TerminalCtor = (xtermModule as any).Terminal ?? (xtermModule as any).default?.Terminal;
const FitAddonCtor = (fitModule as any).FitAddon ?? (fitModule as any).default?.FitAddon;
const ALPINE_ISO = '/api/iso';
const LINUX4_ISO = '/linux4.iso';

type Profile = { name: string; memoryMiB: number; cdrom: string };
type V86 = { add_listener(name:string, cb:(value:number)=>void):void; serial0_send(data:string):void; stop?:()=>void; destroy?:()=>void };

export class V86LinuxTerminal {
  private term: any;
  private fitAddon: any;
  private emulator: V86 | null = null;
  private profile: Profile = { name: 'Developer Alpine', memoryMiB: 1024, cdrom: ALPINE_ISO };
  private bootId = 0;
  private activeBoot: Promise<void> | null = null;
  private serial = '';
  private ready = false;
  private resizeObserver: ResizeObserver | null = null;
  private static runtimePromise: Promise<void> | null = null;

  constructor(containerId = 'v86-terminal-container') {
    if (!TerminalCtor || !FitAddonCtor) throw new Error('xterm failed to load');
    const container = document.getElementById(containerId);
    if (!container) throw new Error('Terminal container is missing');
    this.term = new TerminalCtor({ cursorBlink:true, fontSize:14, convertEol:true, scrollback:10000 });
    this.fitAddon = new FitAddonCtor();
    this.term.loadAddon(this.fitAddon);
    this.term.open(container);
    this.term.onData((data:string) => this.send(data));
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.fit());
      this.resizeObserver.observe(container);
    }
    window.addEventListener('resize', this.fitBound);
    window.setTimeout(() => this.fit(), 100);
    this.bindControls();
  }

  private fitBound = (): void => this.fit();
  private bindControls(): void {
    document.getElementById('btn-v86-alpine')?.addEventListener('click', () => void this.bootDeveloper());
    document.getElementById('btn-v86-fallback')?.addEventListener('click', () => void this.bootLinux4());
    document.getElementById('btn-v86-restart')?.addEventListener('click', () => void this.restart());
    document.getElementById('btn-v86-gcc')?.addEventListener('click', () => this.runGccCheck());
  }

  public async boot(): Promise<void> { await this.bootDeveloper(); }
  public async bootDeveloper(): Promise<void> { await this.start({ name:'Developer Alpine', memoryMiB:1024, cdrom:ALPINE_ISO }); }
  public async bootLinux4(): Promise<void> { await this.start({ name:'Linux 4 compatibility', memoryMiB:256, cdrom:LINUX4_ISO }); }
  public async restart(): Promise<void> { await this.start(this.profile); }

  private async start(profile: Profile): Promise<void> {
    const id = ++this.bootId;
    const previous = this.activeBoot;
    if (previous) { try { await previous; } catch {} }
    if (id !== this.bootId) return;
    const run = this.startInternal(profile, id);
    this.activeBoot = run;
    try { await run; } finally { if (this.activeBoot === run) this.activeBoot = null; }
  }

  private async startInternal(profile: Profile, id: number): Promise<void> {
    await this.disposeVM();
    if (id !== this.bootId) return;
    this.profile = profile;
    this.ready = false;
    this.serial = '';
    this.term.clear();
    this.writeLine('LinuxTerminal — ' + profile.name);
    this.writeLine('Loading browser x86 emulator…');
    this.setStatus(profile.name + ' • loading');
    this.setMonitor(profile.memoryMiB + ' MiB • preparing');

    try {
      await this.loadRuntime();
      if (id !== this.bootId) return;
      const V86Starter = (window as any).V86Starter;
      const screen = document.getElementById('screen_container');
      if (!V86Starter) throw new Error('V86Starter was not loaded');
      if (!screen) throw new Error('VM screen container is missing');

      const vm: V86 = new V86Starter({
        wasm_path: this.asset('/v86.wasm'),
        memory_size: profile.memoryMiB * 1024 * 1024,
        vga_memory_size: 8 * 1024 * 1024,
        bios: { url: this.asset('/seabios.bin') },
        vga_bios: { url: this.asset('/vgabios.bin') },
        cdrom: { url: profile.cdrom, async: true },
        screen_container: screen,
        autostart: true,
        disable_speaker: true,
        disable_mouse: true
      });

      if (id !== this.bootId) { try { vm.stop?.(); vm.destroy?.(); } catch {} return; }
      this.emulator = vm;
      vm.add_listener('serial0-output-byte', (byte:number) => { if (id === this.bootId) this.onSerial(byte); });
      this.setStatus(profile.name + ' • booting');
      this.setMonitor(profile.memoryMiB + ' MiB • booting');
      this.fit();
      this.term.focus();
    } catch (error: unknown) {
      if (id === this.bootId) await this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  private onSerial(byte:number): void {
    const ch = String.fromCharCode(byte & 0xff);
    this.serial = (this.serial + ch).slice(-16000);
    this.term.write(ch);
    const text = this.clean(this.serial);
    if (!this.ready && this.isPrompt(text)) {
      this.ready = true;
      this.setStatus(this.profile.name + ' • ready');
      this.setMonitor(this.profile.memoryMiB + ' MiB • ready');
      window.setTimeout(() => this.send('export TERM=xterm-256color; clear\r'), 150);
    }
  }

  private isPrompt(text:string): boolean {
    const lines = text.split('\n').map((line:string) => line.trim()).filter(Boolean).slice(-12);
    return lines.some((line:string) => /(?:^|\s)[^\s]+(?::[^\s]+)?[#$>]\s*$/.test(line));
  }

  private runGccCheck(): void {
    if (!this.emulator) { this.writeLine('[GCC] Start a VM first.'); return; }
    if (!this.ready) { this.writeLine('[GCC] Wait for the shell prompt.'); return; }
    this.send('command -v gcc >/dev/null 2>&1 && gcc --version || echo "GCC is not installed in this image"\r');
  }

  private send(data:string): void {
    try { this.emulator?.serial0_send(data); } catch (error) { this.writeLine('[Serial error] ' + String(error)); }
  }
  private writeLine(text:string): void { this.term.writeln(text); }
  private setStatus(text:string): void { const el=document.getElementById('v86-status'); if (el) el.textContent=text; }
  private setMonitor(text:string): void { const el=document.getElementById('v86-monitor'); if (el) el.textContent=text; }
  private fit(): void { try { this.fitAddon.fit(); } catch {} }
  private asset(path:string): string { return new URL(path, window.location.origin).href; }
  private clean(text:string): string { return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/\r/g,'\n'); }

  private async fail(message:string): Promise<void> {
    this.ready = false;
    this.setStatus(this.profile.name + ' • error');
    this.setMonitor('Boot failed');
    this.writeLine('');
    this.writeLine('[VM Boot Error] ' + message);
    await this.disposeVM();
  }

  private async disposeVM(): Promise<void> {
    const vm = this.emulator;
    this.emulator = null;
    this.ready = false;
    if (!vm) return;
    try { vm.stop?.(); } catch {}
    try { vm.destroy?.(); } catch {}
  }

  private loadRuntime(): Promise<void> {
    if ((window as any).V86Starter) return Promise.resolve();
    if (V86LinuxTerminal.runtimePromise) return V86LinuxTerminal.runtimePromise;
    V86LinuxTerminal.runtimePromise = new Promise<void>((resolve,reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-v86-runtime="true"]');
      if (existing) {
        existing.addEventListener('load', () => (window as any).V86Starter ? resolve() : reject(new Error('v86 runtime did not initialize')), { once:true });
        existing.addEventListener('error', () => reject(new Error('Failed to load v86 runtime')), { once:true });
        return;
      }
      const script = document.createElement('script');
      script.dataset.v86Runtime = 'true';
      script.src = this.asset('/libv86.js');
      script.async = true;
      script.onload = () => (window as any).V86Starter ? resolve() : reject(new Error('libv86.js did not expose V86Starter'));
      script.onerror = () => reject(new Error('Failed to load /libv86.js'));
      document.head.appendChild(script);
    }).catch((error:unknown) => {
      V86LinuxTerminal.runtimePromise = null;
      throw error;
    });
    return V86LinuxTerminal.runtimePromise;
  }

  public async destroy(): Promise<void> {
    ++this.bootId;
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.fitBound);
    await this.disposeVM();
    this.setStatus('stopped');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    const vm = new V86LinuxTerminal();
    (window as any).linuxLabVM = vm;
    void vm.boot();
  } catch (error) {
    console.error('[LinuxTerminal]', error);
    const status = document.getElementById('v86-status');
    if (status) status.textContent = 'Terminal initialization failed';
  }
});
