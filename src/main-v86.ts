import * as xtermModule from '@xterm/xterm';
import * as fitModule from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const Terminal = (xtermModule as any).Terminal ?? (xtermModule as any).default?.Terminal;
const FitAddon = (fitModule as any).FitAddon ?? (fitModule as any).default?.FitAddon;
const ISO_URL = '/api/iso';

type Profile = { name: string; memoryMiB: number };

export class V86LinuxTerminal {
  private term: any;
  private fitAddon: any;
  private emulator: any = null;
  private state: 'idle'|'loading'|'booting'|'ready'|'error' = 'idle';
  private bootToken = 0;
  private bootPromise: Promise<void> | null = null;
  private profile: Profile = { name: 'Developer Alpine', memoryMiB: 1024 };
  private serial = '';
  private ready = false;
  private static loader: Promise<void> | null = null;

  constructor(containerId = 'v86-terminal-container') {
    if (!Terminal || !FitAddon) throw new Error('Terminal runtime failed to load');
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Missing #${containerId}`);
    this.term = new Terminal({ cursorBlink: true, fontSize: 14, convertEol: true, scrollback: 10000 });
    this.fitAddon = new FitAddon();
    this.term.loadAddon(this.fitAddon);
    this.term.open(container);
    this.term.onData((data: string) => this.send(data));
    new ResizeObserver(() => this.fit()).observe(container);
    window.setTimeout(() => this.fit(), 100);
    this.bindButtons();
  }

  private bindButtons(): void {
    document.getElementById('btn-v86-alpine')?.addEventListener('click', () => void this.bootAlpine(true));
    document.getElementById('btn-v86-fallback')?.addEventListener('click', () => void this.bootQuick());
    document.getElementById('btn-v86-restart')?.addEventListener('click', () => void this.restart());
    document.getElementById('btn-v86-gcc')?.addEventListener('click', () => this.gcc());
  }

  private fit(): void { try { this.fitAddon.fit(); } catch {} }
  private status(s: string): void { const e=document.getElementById('v86-status'); if(e)e.textContent=s; }
  private monitor(s: string): void { const e=document.getElementById('v86-monitor'); if(e)e.textContent=s; }
  private asset(path: string): string { return new URL(path, window.location.origin + '/').href; }

  public async boot(): Promise<void> { await this.bootAlpine(false); }
  public async bootAlpine(force=true): Promise<void> { await this.start({name:'Developer Alpine',memoryMiB:1024},force); }
  public async bootQuick(): Promise<void> { await this.start({name:'Quick Alpine',memoryMiB:256},true); }
  public async restart(): Promise<void> { await this.start(this.profile,true); }

  private async start(profile: Profile, force: boolean): Promise<void> {
    if (!force && this.emulator && this.state !== 'error') { this.term.focus(); return; }
    const token = ++this.bootToken;
    if (this.bootPromise) { try { await this.bootPromise; } catch {} }
    if (token !== this.bootToken) return;
    const run = this.startInternal(profile, token);
    this.bootPromise = run;
    try { await run; } finally { if (this.bootPromise === run) this.bootPromise = null; }
  }

  private async startInternal(profile: Profile, token: number): Promise<void> {
    await this.disposeVM();
    if (token !== this.bootToken) return;
    this.profile=profile; this.ready=false; this.serial=''; this.state='loading';
    this.term.clear(); this.term.writeln(`LinuxTerminal — ${profile.name}`);
    this.term.writeln('Loading real Alpine Linux…');
    this.status(`${profile.name} • loading`);
    this.monitor(`${profile.memoryMiB} MiB`);
    try {
      await this.loadV86();
      if (token !== this.bootToken) return;
      const screen=document.getElementById('screen_container');
      if(!screen) throw new Error('Missing VM screen container');
      const V86Starter=(window as any).V86Starter;
      if(!V86Starter) throw new Error('V86Starter is unavailable');
      const emulator=new V86Starter({
        wasm_path:this.asset('/v86.wasm'),
        memory_size:profile.memoryMiB*1024*1024,
        vga_memory_size:8*1024*1024,
        bios:{url:this.asset('/seabios.bin')},
        vga_bios:{url:this.asset('/vgabios.bin')},
        cdrom:{url:ISO_URL,async:true},
        screen_container:screen,
        autostart:true,
        disable_speaker:true,
        disable_mouse:true
      });
      if(token!==this.bootToken){ try{emulator.stop?.();emulator.destroy?.();}catch{} return; }
      this.emulator=emulator; this.state='booting';
      emulator.add_listener('serial0-output-byte',(b:number)=>{if(token===this.bootToken)this.output(b);});
      this.status(`${profile.name} • booting`);
      this.monitor(`${profile.memoryMiB} MiB • booting`);
      this.fit(); this.term.focus();
    } catch (e) {
      if(token===this.bootToken) this.fail(e instanceof Error?e.message:String(e));
    }
  }

  private output(byte:number):void {
    const ch=String.fromCharCode(byte&255);
    this.serial=(this.serial+ch).slice(-12000);
    this.term.write(ch);
    if(!this.ready && /(?:^|\n)(?:[^\n]*[#>$])\s*$/m.test(this.clean(this.serial))) {
      this.ready=true; this.state='ready';
      this.status(`${this.profile.name} • ready`);
      this.monitor(`${this.profile.memoryMiB} MiB • ready`);
      window.setTimeout(()=>this.send('export TERM=xterm-256color; clear\r'),200);
    }
  }

  private clean(s:string):string{return s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/\r/g,'\n');}
  private send(data:string):void{try{this.emulator?.serial0_send?.(data);}catch(e){this.term.writeln('\r\n[Serial error] '+String(e));}}
  private gcc():void{if(!this.ready){this.term.writeln('\r\n[GCC] Wait for Alpine to finish booting.');return;}this.send('command -v gcc >/dev/null && gcc --version || echo "GCC is not installed in this image"\r');}

  private fail(message:string):void {
    this.state='error'; this.ready=false;
    this.status(`${this.profile.name} • error`); this.monitor('Boot failed');
    this.term.writeln(`\r\n[VM Boot Error] ${message}`);
    void this.disposeVM();
  }

  private async disposeVM():Promise<void>{
    const vm=this.emulator; this.emulator=null; this.ready=false;
    if(!vm)return;
    try{vm.stop?.();}catch{}
    try{vm.destroy?.();}catch{}
  }

  private loadV86():Promise<void>{
    if((window as any).V86Starter)return Promise.resolve();
    if(V86LinuxTerminal.loader)return V86LinuxTerminal.loader;
    V86LinuxTerminal.loader=new Promise<void>((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=this.asset('/libv86.js'); s.async=true;
      s.onload=()=> (window as any).V86Starter ? resolve() : reject(new Error('libv86.js did not expose V86Starter'));
      s.onerror=()=>reject(new Error('Failed to load /libv86.js'));
      document.head.appendChild(s);
    }).catch((e:unknown)=>{V86LinuxTerminal.loader=null;throw e;});
    return V86LinuxTerminal.loader;
  }
}

window.addEventListener('DOMContentLoaded',()=>{
  try{
    const vm=new V86LinuxTerminal();
    (window as any).linuxLabVM=vm;
    void vm.boot();
  }catch(e){
    console.error(e);
    const s=document.getElementById('v86-status');if(s)s.textContent='Terminal initialization failed';
  }
});