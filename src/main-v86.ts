import * as xtermModule from '@xterm/xterm';
import * as fitModule from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const TerminalCtor = (xtermModule as any).Terminal ?? (xtermModule as any).default?.Terminal;
const FitAddonCtor = (fitModule as any).FitAddon ?? (fitModule as any).default?.FitAddon;
const ALPINE_ISO = '/api/iso';
const ALPINE_VIRT_ISO = '/api/iso?image=virt';
const V86_RUNTIME_URL = 'https://copy.sh/v86/build/libv86.js';

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
  private bootStartedAt = 0;
  private bootTimer: number | null = null;
  private bootTimeout: number | null = null;
  private bootMetrics: Array<{profile:string; startedAt:number; readyAt?:number; error?:string}> = [];
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
    document.getElementById('btn-v86-virt')?.addEventListener('click', () => void this.bootVirt());
    document.getElementById('btn-v86-restart')?.addEventListener('click', () => void this.restart());
    document.getElementById('btn-v86-gcc')?.addEventListener('click', () => this.runGccCheck());
    document.getElementById('btn-v86-diagnostics')?.addEventListener('click', () => this.showDiagnostics());
    document.getElementById('btn-v86-screen')?.addEventListener('click', () => this.showScreen());
    document.getElementById('btn-v86-copydiag')?.addEventListener('click', () => void this.copyDiagnostics());
    document.getElementById('btn-v86-terminal')?.addEventListener('click', () => this.showTerminal());
  }

  public async boot(): Promise<void> { await this.bootDeveloper(); }
  public async bootDeveloper(): Promise<void> { await this.start({ name:'Developer Alpine', memoryMiB:1024, cdrom:ALPINE_ISO }); }
  public async bootVirt(): Promise<void> { await this.start({ name:'Alpine Virt 3.24', memoryMiB:512, cdrom:ALPINE_VIRT_ISO }); }
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
    this.showTerminal();
    this.term.clear();
    this.writeLine('LinuxTerminal — ' + profile.name);
    this.writeLine('Loading browser x86 emulator…');
    this.setStatus(profile.name + ' • loading');
    this.setMonitor(profile.memoryMiB + ' MiB • preparing');
    this.bootStartedAt = performance.now();
    this.startBootTimer(profile);
    this.startBootTimeout(profile, id);

    try {
      await this.verifyAssets(profile.cdrom);
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
        boot_order: 0x20,
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
      const elapsed = Math.round(performance.now() - this.bootStartedAt);
      this.setMonitor(this.profile.memoryMiB + ' MiB • ready in ' + (elapsed / 1000).toFixed(1) + 's');
      this.recordBoot({ profile: this.profile.name, startedAt: Date.now() - elapsed, readyAt: Date.now() });
      this.stopBootTimer();
      this.stopBootTimeout();
      window.setTimeout(() => this.send('export TERM=xterm-256color; clear\r'), 150);
    }
  }

  private isPrompt(text:string): boolean {
    const lines = text.split('\n').map((line:string) => line.trim()).filter(Boolean).slice(-12);
    return lines.some((line:string) => /(?:^|\s)[^\s]+(?::[^\s]+)?[#$>]\s*$/.test(line));
  }

  private showScreen(): void { const s=document.getElementById('screen_container'); const t=document.getElementById('v86-terminal-container'); if(s)s.hidden=false; if(t)t.hidden=true; this.fit(); }

  private showTerminal(): void { const s=document.getElementById('screen_container'); const t=document.getElementById('v86-terminal-container'); if(s)s.hidden=true; if(t)t.hidden=false; this.fit(); this.term.focus(); }

  private showDiagnostics(): void {
    const panel = document.getElementById('v86-diagnostics');
    if (!panel) return;
    const stored = (() => { try { return JSON.parse(localStorage.getItem('linuxlab-v86-metrics') || '[]'); } catch { return []; } })();
    const lines = [
      'VM diagnostics',
      'Profile: ' + this.profile.name,
      'VM object: ' + (this.emulator ? 'created' : 'not created'),
      'V86 runtime: ' + ((window as any).V86Starter ? 'ready' : 'not ready'),
      'Shell detected: ' + (this.ready ? 'yes' : 'waiting'),
      'Recent boots: ' + JSON.stringify(stored.slice(-5), null, 2),
      'ISO endpoint: ' + this.profile.cdrom,
      'Tip: diagnostics are stored locally; they are not automatically uploaded.'
    ];
    panel.textContent = lines.join('\n');
    panel.hidden = !panel.hidden;
  }

  private async copyDiagnostics(): Promise<void> { this.showDiagnostics(); const text=document.getElementById('v86-diagnostics')?.textContent||'No diagnostics available'; try { await navigator.clipboard.writeText(text); this.writeLine('[Diagnostics] Copied to clipboard.'); } catch { this.writeLine('[Diagnostics] Clipboard access was unavailable.'); } }

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
    this.stopBootTimer();
    this.stopBootTimeout();
    this.recordBoot({ profile: this.profile.name, startedAt: Date.now() - Math.round(performance.now() - this.bootStartedAt), error: message });
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

  private async verifyAssets(cdrom: string): Promise<void> {
    const required = ['/v86.wasm', '/seabios.bin', '/vgabios.bin'];
    for (const url of required) {
      const response = await fetch(this.asset(url), { method: 'GET', cache: 'no-store', headers: { Range: 'bytes=0-0' } });
      if (!response.ok && response.status !== 206) throw new Error(`Required VM asset failed to load: ${url} (${response.status})`);
    }
    const iso = await fetch(cdrom, { method: 'GET', cache: 'no-store', headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(30000) });
    if (!iso.ok && iso.status !== 206) throw new Error(`Linux image is unavailable (${iso.status})`);
  }

  private startBootTimer(profile: Profile): void {
    this.stopBootTimer();
    this.bootTimer = window.setInterval(() => {
      const seconds = ((performance.now() - this.bootStartedAt) / 1000).toFixed(1);
      this.setMonitor(profile.memoryMiB + ' MiB • booting ' + seconds + 's');
    }, 250);
  }

  private stopBootTimer(): void { if (this.bootTimer !== null) { window.clearInterval(this.bootTimer); this.bootTimer = null; } }

  private startBootTimeout(profile: Profile, id: number): void { this.stopBootTimeout(); this.bootTimeout=window.setTimeout(()=>{ if(id===this.bootId&&!this.ready) void this.fail(profile.name+' did not reach a shell prompt within 180 seconds. Try Screen mode or reboot.'); },180000); }
  private stopBootTimeout(): void { if(this.bootTimeout!==null){window.clearTimeout(this.bootTimeout);this.bootTimeout=null;} }

  private recordBoot(metric: {profile:string; startedAt:number; readyAt?:number; error?:string}): void {
    this.bootMetrics = [...this.bootMetrics.slice(-19), metric];
    try { localStorage.setItem('linuxlab-v86-metrics', JSON.stringify(this.bootMetrics)); } catch {}
    window.dispatchEvent(new CustomEvent('linuxlab-v86-metric', { detail: metric }));
  }

  private loadRuntime(): Promise<void> {
    if ((window as any).V86Starter) return Promise.resolve();
    if (V86LinuxTerminal.runtimePromise) return V86LinuxTerminal.runtimePromise;
    V86LinuxTerminal.runtimePromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = V86_RUNTIME_URL;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = () => (window as any).V86Starter ? resolve() : reject(new Error('The v86 runtime loaded but did not expose V86Starter'));
      script.onerror = () => reject(new Error('Unable to download the v86 runtime. Check network access or host libv86.js with the matching v86.wasm.'));
      document.head.appendChild(script);
    }).catch((error: unknown) => {
      V86LinuxTerminal.runtimePromise = null;
      throw error;
    });
    return V86LinuxTerminal.runtimePromise;
  }
  public async destroy(): Promise<void> {
    ++this.bootId;
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.fitBound);
    this.stopBootTimer();
    this.stopBootTimeout();
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
