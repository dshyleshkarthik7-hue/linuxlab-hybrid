import * as xtermModule from '@xterm/xterm';
import * as fitModule from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const TerminalConstructor = (xtermModule as any).Terminal || (xtermModule as any).default?.Terminal || (xtermModule as any).default || xtermModule;
const FitAddonConstructor = (fitModule as any).FitAddon || (fitModule as any).default?.FitAddon || (fitModule as any).default || fitModule;

type VMState = 'stopped' | 'loading' | 'booting' | 'ready' | 'error';
type AlpineLoginState = 'waiting' | 'login-detected' | 'username-sent' | 'ready';
type BootProfile = { name: string; iso: string; fallback?: boolean };

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
  private bootPromptHandled = false;
  private guestTtyConfigured = false;
  private alpineLoginState: AlpineLoginState = 'waiting';
  private serialBuffer = '';
  private decoder = new TextDecoder('utf-8');
  private bootTimer: number | null = null;
  private progressTimer: number | null = null;
  private monitorTimer: number | null = null;
  private gccRequested = false;
  private gccSetupStarted = false;
  private bootStartedAt = 0;
  private lastOutputAt = 0;
  private readonly GUEST_MEMORY_BYTES = 1024 * 1024 * 1024;
  private currentProfile: BootProfile = { name: 'Alpine Linux (Custom GCC)', iso: ISO_STREAM_ENDPOINT };

  private assetUrl(path: string): string { return new URL(path, document.baseURI).toString(); }

  constructor(containerId = 'v86-terminal-container') { this.containerId = containerId; this.initTerminal(); this.bindExternalButtons(); }

  private initTerminal(): void {
    const container = document.getElementById(this.containerId);
    if (!container) { console.error(`[LinuxLab] Missing #${this.containerId}`); return; }
    container.style.width = '100%'; container.style.height = '100%'; container.style.position = 'relative'; container.style.display = 'block'; container.style.overflow = 'hidden';
    this.term = new TerminalConstructor({ cursorBlink: true, fontSize: 14, fontFamily: '"Cascadia Code", "Fira Code", "Courier New", monospace', theme: { background: '#04060a', foreground: '#38bdf8', cursor: '#38bdf8', selectionBackground: '#1e3a8a' }, convertEol: true, scrollback: 10000, allowTransparency: false });
    this.fitAddon = new FitAddonConstructor(); this.term.loadAddon(this.fitAddon); this.term.open(container);
    window.setTimeout(() => this.fit(), 50);
    if (typeof ResizeObserver !== 'undefined') { this.resizeObserver = new ResizeObserver(() => this.handleViewportResize()); this.resizeObserver.observe(container); }
    window.addEventListener('resize', this.onWindowResize);
    this.term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.key === 'Tab') { if (event.type === 'keydown') this.sendSerial('\t'); return false; }
      if (event.ctrlKey && ['c','d','z','l','o','x','w','k','u','r','g','j','t'].includes(event.key.toLowerCase())) {
        if (event.type === 'keydown') { const code = event.key.toLowerCase().charCodeAt(0) - 96; if (code > 0 && code < 32) this.sendSerial(String.fromCharCode(code)); }
        return false;
      }
      return true;
    });
    this.term.onData((data: string) => { if (!this.emulator) { this.writeLine('\r\n\x1b[33m[Terminal] VM is not running.\x1b[0m'); return; } this.sendSerial(data); });
    container.addEventListener('click', () => this.term?.focus());
  }

  private onWindowResize = (): void => this.handleViewportResize();
  private handleViewportResize(): void { if (this.resizeDebounceTimer !== null) window.clearTimeout(this.resizeDebounceTimer); this.resizeDebounceTimer = window.setTimeout(() => this.fit(), 50); }
  public fit(): void { try { this.fitAddon?.fit(); } catch {} }
  private writeLine(text: string): void { try { this.term?.writeln(text); } catch { console.log(text); } }

  private bindExternalButtons(): void {
    document.getElementById('btn-v86-restart')?.addEventListener('click', () => void this.restart());
    document.getElementById('btn-v86-alpine')?.addEventListener('click', () => void this.bootAlpine(true));
    document.getElementById('btn-v86-fallback')?.addEventListener('click', () => void this.bootLinux4());
    document.getElementById('btn-v86-gcc')?.addEventListener('click', () => this.requestGcc());
  }

  private setStatus(text: string): void { const el = document.getElementById('v86-status'); if (el) el.textContent = text; }
  private setMonitor(text: string): void { const el = document.getElementById('v86-monitor'); if (el) el.textContent = text; }

  public async boot(): Promise<void> { await this.bootAlpine(false); }
  public async bootAlpine(force = true): Promise<void> { await this.startProfile({ name: 'Alpine Linux (Custom GCC)', iso: ISO_STREAM_ENDPOINT }, force); }
  public async bootLinux4(): Promise<void> { await this.startProfile({ name: 'Linux4', iso: './linux4.iso', fallback: true }, true); }

  private async startProfile(profile: BootProfile, force: boolean): Promise<void> {
    if (!force && this.emulator && this.state !== 'error') { this.term?.focus(); return; }
    this.stopTimers(); await this.destroyEmulator();
    this.currentProfile = profile; this.state = 'loading'; this.shellReady = false; this.bootPromptHandled = false; this.guestTtyConfigured = false; this.alpineLoginState = 'waiting'; this.serialBuffer = ''; this.gccSetupStarted = false; this.bootStartedAt = performance.now(); this.lastOutputAt = this.bootStartedAt;
    try { this.term?.clear(); } catch {}
    this.writeLine('\x1b[1;36m============================================================\x1b[0m');
    this.writeLine(`\x1b[1;32m LinuxLab Engine B — ${profile.name}\x1b[0m`);
    this.writeLine('\x1b[36m Alpine Linux image; GCC availability is checked after login.\x1b[0m');
    this.writeLine(`Endpoint: \x1b[33m${profile.iso}\x1b[0m`); this.writeLine('');
    const relay = this.getRelay();
    if (relay) this.writeLine(`\x1b[36mNetwork relay enabled: ${relay}\x1b[0m`);
    else this.writeLine('\x1b[33mGuest networking is off by default. A compatible WebSocket relay can be supplied with ?relay=wss://...\x1b[0m');
    this.writeLine('\x1b[90mStreaming image blocks from server...\x1b[0m');
    this.setStatus(`${profile.name} • loading`);
    this.setMonitor(`RAM allocation: ${this.memoryMiB()} MiB • ISO transfer: measuring… • ${this.connectionSummary()}`);

    try {
      await this.loadScript();
      const V86Starter = (window as any).V86Starter || (window as any).V86;
      if (!V86Starter) throw new Error('v86 runtime was not found at /libv86.js');
      const screen = document.getElementById('screen_container');
      if (!screen) throw new Error('Missing #screen_container');
      const options: any = {
        wasm_path: this.assetUrl('v86.wasm'), memory_size: this.GUEST_MEMORY_BYTES, vga_memory_size: 8 * 1024 * 1024,
        bios: { url: this.assetUrl('seabios.bin') }, vga_bios: { url: this.assetUrl('vgabios.bin') },
        cdrom: { url: profile.iso, async: true }, screen_container: screen, autostart: true, disable_speaker: true, disable_keyboard: false, disable_mouse: true,
      };
      if (relay) options.network_relay_url = relay;
      this.emulator = new V86Starter(options);
      this.emulator.add_listener('serial0-output-byte', (byte: number) => this.handleSerialByte(byte));
      this.state = 'booting'; this.lastOutputAt = performance.now(); this.bootTimer = null;
      this.progressTimer = window.setInterval(() => this.reportBootProgress(), 15_000);
      this.monitorTimer = window.setInterval(() => this.updateUsageMonitor(), 1_000);
      this.fit(); this.term?.focus();
    } catch (error: any) { this.handleBootError(error?.message || String(error)); }
  }

  private handleSerialByte(byte: number): void {
    let char = ''; try { char = this.decoder.decode(new Uint8Array([byte]), { stream: true }); } catch { char = String.fromCharCode(byte); }
    if (!char) return; this.lastOutputAt = performance.now(); this.serialBuffer = (this.serialBuffer + char).slice(-16000);
    try { this.term?.write(char); } catch {}
    const visible = this.stripAnsi(this.serialBuffer);
    if (/No space left on device/i.test(visible) && !this.shellReady) { this.handleBootError('Alpine overlay ran out of writable space during boot. VM memory has been restored to 1 GiB; if this persists, the ISO/apkovl needs to be rebuilt with a larger writable target.'); return; }
    if (/Launching initramfs emergency recovery shell/i.test(visible) && !this.shellReady) { this.handleBootError('Alpine entered initramfs emergency recovery instead of reaching the normal system shell.'); return; }
    if (!this.shellReady && this.isShellPrompt(visible)) { this.markReady(); return; }
    if (!this.bootPromptHandled && /(?:^|\n)\s*boot:\s*$/im.test(visible)) { this.bootPromptHandled = true; window.setTimeout(() => { if (!this.shellReady && this.emulator) this.sendSerial('\r'); }, 250); }
    if (this.currentProfile.iso === ISO_STREAM_ENDPOINT && !this.shellReady && this.alpineLoginState === 'waiting' && /(?:^|\n)\s*(?:localhost\s+)?login:\s*$/im.test(visible)) { this.alpineLoginState = 'login-detected'; this.writeLine('\x1b[36m[Alpine] Login prompt detected. Logging in as root...\x1b[0m'); if (!this.shellReady && this.emulator) { this.alpineLoginState = 'username-sent'; this.sendAutomaticLogin('root\r'); } }
    if (!this.shellReady && this.isShellPrompt(visible)) this.markReady();
  }

  private isShellPrompt(text: string): boolean { const lines = text.replace(/\r/g,'\n').split('\n').map(line => line.trim()).filter(Boolean).slice(-30); for (const line of lines) { if (/^localhost:[^\n]*[%#$>]$/.test(line) || /^[A-Za-z0-9._-]+:[^\n]*[%#$>]$/.test(line) || /^\(none\):[^\n]*[%#$>]$/.test(line) || /^[\w.-]+@[\w.-]+:[^\n]*[%#$>]$/.test(line) || /^(?:~|\.|\/)[^\s]*[%#$>]$/.test(line) || /^[%#$>]$/.test(line)) return true; } return false; }

  private markReady(): void {
    if (this.shellReady) return; this.shellReady = true; this.state = 'ready'; this.alpineLoginState = 'ready'; this.stopTimers(); this.setStatus(`${this.currentProfile.name} • ready`); this.setMonitor(`RAM allocation: ${this.memoryMiB()} MiB • ISO transfer: ${this.getIsoTransferRate()} • ${this.connectionSummary()}`); this.fit();
    if (!this.guestTtyConfigured) { this.guestTtyConfigured = true; const cols = this.term?.cols || 120, rows = this.term?.rows || 30; window.setTimeout(() => { this.sendSerial(`stty cols ${cols} rows ${rows}; export TERM=xterm-256color LINES=${rows} COLUMNS=${cols}; clear\r`); this.term?.focus(); }, 300); }
    window.setTimeout(() => { if (this.shellReady) this.checkGccToolchain(); }, 600);
  }

  public requestGcc(): void { this.term?.focus(); if (!this.shellReady) { this.gccRequested = true; this.writeLine('\r\n\x1b[33m[GCC] VM is booting. Toolchain will be checked once logged in...\x1b[0m'); return; } this.checkGccToolchain(); }
  private checkGccToolchain(): void { if (!this.shellReady || !this.emulator || this.gccSetupStarted) return; this.gccSetupStarted = true; this.sendCommand('echo "[LinuxLab] Validating GCC installation..."; if command -v gcc >/dev/null 2>&1; then echo -e "\\033[1;32m[LinuxLab] GCC Toolchain is available:\\033[0m"; gcc --version; else echo -e "\\033[1;31m[LinuxLab] GCC not found on rootfs\\033[0m"; fi'); }
  public sendCommand(command: string): void { if (!this.emulator || !this.shellReady) { this.writeLine(`\r\n\x1b[33m[Terminal] Shell is not ready; command not sent: ${command}\x1b[0m`); return; } this.sendSerial(`${command}\r`); }
  private sendAutomaticLogin(data: string): void { if (this.shellReady || (this.alpineLoginState !== 'login-detected' && this.alpineLoginState !== 'username-sent') || data !== 'root\r') return; this.sendSerial(data); }
  private sendSerial(data: string): void { if (!this.emulator || typeof this.emulator.serial0_send !== 'function') return; if (data === 'root\r' && (this.shellReady || this.alpineLoginState === 'ready')) return; try { this.emulator.serial0_send(data); } catch (error) { this.writeLine(`\r\n\x1b[1;31m[Serial Error] ${String(error)}\x1b[0m`); } }
  public async restart(): Promise<void> { this.writeLine('\r\n\x1b[1;33m[Restarting Virtual Machine...]\x1b[0m'); await this.bootAlpine(true); }
  public async destroy(): Promise<void> { this.stopTimers(); if (this.resizeDebounceTimer !== null) { window.clearTimeout(this.resizeDebounceTimer); this.resizeDebounceTimer = null; } if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; } window.removeEventListener('resize', this.onWindowResize); await this.destroyEmulator(); this.state='stopped'; this.shellReady=false; this.guestTtyConfigured=false; this.alpineLoginState='waiting'; this.serialBuffer=''; this.gccSetupStarted=false; this.term?.clear(); this.setStatus('stopped'); }
  private async destroyEmulator(): Promise<void> { const emulator=this.emulator; if(!emulator)return; this.emulator=null; this.shellReady=false; try { if(typeof emulator.stop==='function') await emulator.stop(); } catch(error){ console.warn('[LinuxLab] v86 stop failed during cleanup',error); } try { if(typeof emulator.destroy==='function') await emulator.destroy(); } catch(error){ console.warn('[LinuxLab] v86 destroy failed during cleanup',error); } }
  private reportBootProgress(): void { if(!this.emulator||this.shellReady||this.state==='error')return; const elapsed=Math.round((performance.now()-this.bootStartedAt)/1000), silent=Math.round((performance.now()-this.lastOutputAt)/1000); if(silent>=10)this.writeLine(`\x1b[33m[Boot monitor] ${elapsed}s elapsed; guest is still booting...\x1b[0m`); this.setMonitor(`RAM allocation: ${this.memoryMiB()} MiB • ISO transfer: ${this.getIsoTransferRate()} • Boot: ${elapsed}s • ${this.connectionSummary()}`); }
  private updateUsageMonitor(): void { if(!this.emulator||this.state==='error')return; const elapsed=Math.max(1,(performance.now()-this.bootStartedAt)/1000); const rate=this.getIsoTransferRate(); const state=this.shellReady?'ready':this.state; this.setMonitor(`RAM allocation: ${this.memoryMiB()} MiB • ISO transfer: ${rate} • Boot: ${Math.round(elapsed)}s • ${this.connectionSummary()} • ${state}`); }
  private memoryMiB(): number { return Math.round(this.GUEST_MEMORY_BYTES / 1024 / 1024); }
  private connectionSummary(): string { const connection=(navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection; const downlink=typeof connection?.downlink==='number' ? `${connection.downlink.toFixed(1)} Mbps est.` : 'network estimate unavailable'; const relay=this.getRelay() ? 'relay enabled' : 'guest network off'; return `Net: ${downlink} • ${relay}`; }
  private getIsoTransferRate(): string { try { const entries=performance.getEntriesByName(new URL(ISO_STREAM_ENDPOINT,document.baseURI).href) as PerformanceResourceTiming[]; const entry=entries[entries.length-1]; if(!entry || !entry.responseEnd || entry.transferSize <= 0)return 'measuring…'; const seconds=Math.max(.001,(entry.responseEnd-entry.startTime)/1000); return `${(entry.transferSize/1024/1024/seconds).toFixed(1)} MB/s`; } catch { return 'measuring…'; } }
  private handleBootError(message:string):void { this.stopTimers(); this.writeLine(`\r\n\x1b[1;31m[VM Boot Error] ${message}\x1b[0m`); this.state='error'; this.setStatus(`${this.currentProfile.name} • error`); this.setMonitor(`RAM allocation: ${this.memoryMiB()} MiB • ${this.connectionSummary()} • boot error`); }
  private stopTimers():void { if(this.bootTimer!==null){window.clearTimeout(this.bootTimer);this.bootTimer=null;} if(this.progressTimer!==null){window.clearInterval(this.progressTimer);this.progressTimer=null;} if(this.monitorTimer!==null){window.clearInterval(this.monitorTimer);this.monitorTimer=null;} }
  private getRelay():string|null { try { const relay=new URLSearchParams(window.location.search).get('relay'); return relay&&/^wss?:\/\//i.test(relay)?relay:null; } catch { return null; } }
  private stripAnsi(text:string):string { return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g,'').replace(/\x1b./g,'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,''); }
  private loadScript():Promise<void>{ return new Promise((resolve,reject)=>{ if((window as any).V86Starter||(window as any).V86){resolve();return;} const existing=document.querySelector('script[data-linuxlab-v86]') as HTMLScriptElement|null; if(existing){existing.addEventListener('load',()=>resolve(),{once:true});existing.addEventListener('error',()=>reject(new Error('Failed to load libv86.js.')),{once:true});return;} const script=document.createElement('script');script.src=this.assetUrl('libv86.js');script.async=true;script.dataset.linuxlabV86='true';script.onload=()=>resolve();script.onerror=()=>reject(new Error('Failed to load libv86.js from the application assets.'));document.head.appendChild(script);}); }
}