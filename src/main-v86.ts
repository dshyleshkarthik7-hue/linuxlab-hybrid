import * as xtermModule from '@xterm/xterm';
import * as fitModule from '@xterm/addon-fit';
// The npm package's public entry point does not export the emulator constructor.
// Load the version-matched browser bundle shipped with this deployment instead.
import '@xterm/xterm/css/xterm.css';

const TerminalCtor = xtermModule.Terminal;
const FitAddonCtor = fitModule.FitAddon;

declare global {
  interface Window {
    V86?: new (options: V86Options) => V86;
    linuxLabVM?: V86LinuxTerminal;
  }
}

interface V86Options {
  wasm_path: string;
  memory_size: number;
  vga_memory_size: number;
  screen_container: HTMLElement;
  bios: { url: string };
  vga_bios: { url: string };
  cdrom: { url: string; async: boolean };
  boot_order: number;
  autostart: boolean;
  disable_speaker: boolean;
}
const ALPINE_ISO = '/api/iso';
const ALPINE_VIRT_ISO = '/api/iso?image=virt';
const ULTRA_LIGHT_ISO = '/api/iso?image=linux4';
type Profile = {
  name: string;
  memoryMiB: number;
  cdrom: string;
  supported: boolean;
  note?: string;
  arch?: 'x86' | 'x86_64';
};

function profileMemory(profile: Profile): number {
  return profile.memoryMiB;
}
type V86 = { add_listener(name:string, cb:(value:number)=>void):void; serial0_send(data:string):void; keyboard_send_text?:(data:string)=>void; stop?:()=>void; destroy?:()=>void };

export class V86LinuxTerminal {
 private term: xtermModule.Terminal;
  private fitAddon: fitModule.FitAddon;
  private emulator: V86 | null = null;
 private static runtimePromise:Promise<void>|null=null;
 private terminalDataDisposable:{dispose():void}|null=null;
 private profile:Profile={name:'Developer Alpine',memoryMiB:1024,cdrom:ALPINE_ISO,supported:true};
 private bootId=0;
  private bootController: AbortController | null = null;
  private ready=false;
  private health:'booting'|'ready'|'offline'='booting';
  private serial='';
  private bootTimeout:number|null=null;
  private bootPromptSent=false;
  private bootPromptTimer:number|null=null;
  private bootRetryTimer:number|null=null;
  private bootStage='starting';
  private lastSerialAt=0;
  private bootStartedAt=0;
 constructor(containerId='v86-terminal-container'){
  if(!TerminalCtor||!FitAddonCtor) throw new Error('Terminal runtime failed to load');
  const container=document.getElementById(containerId); if(!container) throw new Error('Terminal container is missing');
  this.term=new TerminalCtor({cursorBlink:true,fontSize:14,convertEol:true,scrollback:10000});
  this.fitAddon=new FitAddonCtor(); this.term.loadAddon(this.fitAddon); this.term.open(container);
  this.terminalDataDisposable=this.term.onData((d:string)=>this.emulator?.serial0_send(d));
  window.addEventListener('resize',()=>this.fit()); setTimeout(()=>this.fit(),100); this.bindControls(); void this.start(this.profile);
 }
 private bindControls():void{
  document.getElementById('btn-v86-alpine')?.addEventListener('click',()=>void this.start({name:'Developer Alpine',memoryMiB:1024,cdrom:ALPINE_ISO,supported:true}));
  document.getElementById('btn-v86-virt')?.addEventListener('click',()=>void this.start({name:'Alpine Virt 3.24.1',memoryMiB:512,cdrom:ALPINE_VIRT_ISO,supported:true,arch:'x86',note:'Lightweight 32-bit Alpine Virt profile.'}));
  document.getElementById('btn-v86-linux4')?.addEventListener('click',()=>void this.start({name:'Ultra Light Linux 4',memoryMiB:256,cdrom:ULTRA_LIGHT_ISO,supported:true,arch:'x86',note:'Approx. 7.4 MB ultra-light Linux practice image.'}));
  document.getElementById('btn-v86-restart')?.addEventListener('click',()=>void this.start(this.profile));
  document.getElementById('btn-v86-terminal')?.addEventListener('click',()=>this.showTerminal());
  document.getElementById('btn-v86-screen')?.addEventListener('click',()=>this.showScreen());
  document.getElementById('btn-v86-diagnostics')?.addEventListener('click',()=>this.showDiagnostics());
  document.getElementById('btn-v86-copydiag')?.addEventListener('click',()=>void this.copyDiagnostics());
 }
 private async start(profile:Profile):Promise<void>{
  // A new boot invalidates all callbacks from the previous VM.
  const id=++this.bootId;
  this.bootController?.abort();
  this.bootController=new AbortController();
  const signal=this.bootController.signal;
  await this.dispose(); this.profile=profile; this.ready=false; this.setHealth('booting'); this.serial=''; this.lastSerialAt=0; this.bootStartedAt=Date.now(); this.bootPromptSent=false; this.bootStage='starting'; this.showTerminal(); this.term.clear();
  if(!profile.supported){this.setHealth('offline');this.showTerminal();this.term.clear();this.status(profile.name+' • incompatible with browser VM');this.monitor('Not booted • '+(profile.arch||'unknown architecture'));this.term.writeln('LinuxTerminal — '+profile.name);this.term.writeln('\r\n[Compatibility] '+(profile.note||'This image cannot run in this browser emulator.'));this.term.writeln('[Use Developer Alpine for the real VM.]');return;}
  this.setHealth('booting'); this.status(profile.name+' • checking runtime'); this.term.writeln('LinuxTerminal — '+profile.name);
  try{
   await this.loadRuntime();
   if(id!==this.bootId || signal.aborted)return;
   await this.preflightRuntimeAssets();
   if(id!==this.bootId)return;
   this.status(profile.name+' • checking image');
   const iso=await fetch(profile.cdrom,{method:'GET',headers:{Range:'bytes=0-0'},cache:'no-store',signal:AbortSignal.any([signal, AbortSignal.timeout(30000)])});
   if(!iso.ok&&iso.status!==206) throw new Error('Linux image unavailable ('+iso.status+')');
   if(id!==this.bootId)return;
   const screen=document.getElementById('screen_container'); if(!screen)throw new Error('VM screen container is missing');
   this.bootStage='creating VM'; this.status(profile.name+' • booting'); this.monitor(profile.memoryMiB+' MiB • starting');
   const Runtime=window.V86;
   if(typeof Runtime!=='function') throw new Error('Local v86 runtime did not expose window.V86');
   const vm=new Runtime({wasm_path:'/v86.wasm',memory_size:profile.memoryMiB*1024*1024,vga_memory_size:8*1024*1024,screen_container:screen,bios:{url:'/seabios.bin'},vga_bios:{url:'/vgabios.bin'},cdrom:{url:profile.cdrom,async:true},boot_order:0x20,autostart:true,disable_speaker:true});
   this.emulator=vm;
   vm.add_listener('serial0-output-byte',(byte:number)=>{if(id===this.bootId)this.serialOutput(byte);});
   this.scheduleBootWatchdog(id);
   this.fit();
  }catch(e){if(id===this.bootId)this.error(e instanceof Error?e.message:String(e));}
 }
 private loadRuntime():Promise<void>{
  if(typeof window.V86==='function') return Promise.resolve();
  if(V86LinuxTerminal.runtimePromise) return V86LinuxTerminal.runtimePromise;
  V86LinuxTerminal.runtimePromise=new Promise<void>((resolve,reject)=>{
   const script=document.querySelector<HTMLScriptElement>('script[data-linuxlab-v86]');
   if(!script){reject(new Error('Missing static /libv86.js runtime tag'));return;}
   const finish=()=>typeof window.V86==='function'?resolve():reject(new Error('Local libv86.js loaded but window.V86 was not exposed'));
   script.addEventListener('load',finish,{once:true});
   script.addEventListener('error',()=>reject(new Error('Failed to load /libv86.js')),{once:true});
  }).catch((error:unknown)=>{V86LinuxTerminal.runtimePromise=null;throw error;});
  return V86LinuxTerminal.runtimePromise;
 }
 private async preflightRuntimeAssets():Promise<void>{
  const assets=['/libv86.js','/v86.wasm','/seabios.bin','/vgabios.bin'];
  await Promise.all(assets.map(async asset=>{
   const response=await fetch(asset,{method:'GET',headers:{Range:'bytes=0-0'},cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!response.ok&&response.status!==206) throw new Error('Required VM asset failed to load: '+asset+' ('+response.status+')');
   try{await response.body?.cancel();}catch(error){console.debug('[LinuxLab] Asset response cleanup failed:',error);}
  }));
 }
 private scheduleBootWatchdog(id:number):void{if(this.bootTimeout!==null)clearTimeout(this.bootTimeout);this.bootTimeout=window.setTimeout(()=>{if(this.ready||id!==this.bootId)return;const serialAge=this.lastSerialAt?Date.now()-this.lastSerialAt:Number.POSITIVE_INFINITY;if(this.lastSerialAt&&serialAge<120000){this.bootStage='guest still booting';this.setHealth('booting');this.status(this.profile.name+' • still booting');this.monitor('Serial activity detected • continuing to wait');this.scheduleBootWatchdog(id);return;}const elapsed=Math.round((Date.now()-this.bootStartedAt)/60000);this.bootStage='boot taking longer than expected';this.setHealth('booting');this.status(this.profile.name+' • still booting');this.monitor('No recent serial output • '+elapsed+' min elapsed');this.term.writeln('\r\n[VM] Boot is taking longer than expected. The VM is still running; open Screen to check the guest console or keep waiting.');this.scheduleBootWatchdog(id);},120000);}
 private serialOutput(byte: number): void {
    const ch = String.fromCharCode(byte & 255);
    this.lastSerialAt = Date.now();
    this.serial = (this.serial + ch).slice(-16000);
    this.term.write(ch);

    if (!this.bootPromptSent && /\bboot:\s*$/i.test(this.serial)) {
      this.bootPromptSent = true;
      this.bootStage = 'bootloader prompt';
      this.status(this.profile.name + ' • starting default boot');
      this.monitor(profileMemory(this.profile) + ' MiB • bootloader');
      this.bootPromptTimer = window.setTimeout(() => {
        this.bootPromptTimer = null;
        const vm = this.emulator;
        if (!vm) return;
        this.bootStage = 'default boot selected';
        if (typeof vm.keyboard_send_text === 'function') vm.keyboard_send_text('\n');
        else vm.serial0_send('\n');
      }, 250);
    }

    const promptDetected = /(?:Welcome to Alpine Linux|OpenRC .*starting up Linux|localhost login:|(?:^|\r?\n)[^\r\n]{0,100}[#$>]\s*$)/mi.test(this.serial);
    if (!this.ready && promptDetected) {
      this.ready = true;
      this.bootStage = /(?:[#$>]\s*$)/m.test(this.serial) ? 'shell ready' : 'guest running';
      if (this.bootTimeout !== null) clearTimeout(this.bootTimeout);
      this.bootTimeout = null;
      if (this.bootRetryTimer !== null) clearTimeout(this.bootRetryTimer);
      this.bootRetryTimer = null;
      this.setHealth('ready');
      this.status(this.profile.name + ' • ' + (this.bootStage === 'shell ready' ? 'ready' : 'running'));
      this.monitor(this.profile.memoryMiB + ' MiB • ' + (this.bootStage === 'shell ready' ? 'shell ready' : 'guest running'));
    }
  }

 private showTerminal():void{const s=document.getElementById('screen_container'),t=document.getElementById('v86-terminal-container');if(s)s.hidden=true;if(t)t.hidden=false;this.fit();this.term.focus();}
 private showScreen():void{const s=document.getElementById('screen_container'),t=document.getElementById('v86-terminal-container');if(s)s.hidden=false;if(t)t.hidden=true;this.fit();}
 private status(t:string):void{const e=document.getElementById('v86-status');if(e)e.textContent=t;} private setHealth(state:'booting'|'ready'|'offline'):void{this.health=state;const e=document.getElementById('v86-health');if(e){e.dataset.state=state;e.setAttribute('aria-label',state==='ready'?'VM working':state==='booting'?'VM booting':'VM offline');}}
 private monitor(t:string):void{const e=document.getElementById('v86-monitor');if(e)e.textContent=t;}
 private fit():void{try{this.fitAddon.fit();}catch(error){console.warn('[LinuxLab] VM terminal resize failed:',error);}}
 private error(message:string):void{this.ready=false;this.bootStage='error';this.setHealth('offline');if(this.bootTimeout!==null){clearTimeout(this.bootTimeout);this.bootTimeout=null;}if(this.bootPromptTimer!==null){clearTimeout(this.bootPromptTimer);this.bootPromptTimer=null;}if(this.bootRetryTimer!==null){clearTimeout(this.bootRetryTimer);this.bootRetryTimer=null;}this.status(this.profile.name+' • error');this.monitor('Boot failed');this.term.writeln('\r\n[VM] '+message);}
 private async dispose():Promise<void>{if(this.bootTimeout!==null){clearTimeout(this.bootTimeout);this.bootTimeout=null;}if(this.bootPromptTimer!==null){clearTimeout(this.bootPromptTimer);this.bootPromptTimer=null;}if(this.bootRetryTimer!==null){clearTimeout(this.bootRetryTimer);this.bootRetryTimer=null;}const vm=this.emulator;this.emulator=null;try{vm?.stop?.();vm?.destroy?.();}catch(error){console.warn('[LinuxLab] VM cleanup failed:',error);}}
 public destroy():void{this.bootId++;this.bootController?.abort();this.bootController=null;void this.dispose();this.terminalDataDisposable?.dispose();this.terminalDataDisposable=null;try{this.term.dispose();}catch(error){console.debug('[LinuxLab] Ignored cleanup error:',error);}}
 private showDiagnostics():void{const p=document.getElementById('v86-diagnostics');if(!p)return;p.textContent=['VM diagnostics','Profile: '+this.profile.name,'VM mode: '+(this.profile.name==='Developer Alpine'?'primary':'optional compatibility'),'VM object: '+(this.emulator?'created':'not created'),'Runtime: local version-matched browser bundle','Shell detected: '+(this.ready?'yes':this.lastSerialAt?'waiting (serial active)':'waiting'),'ISO endpoint: '+this.profile.cdrom,'Architecture: '+(this.profile.arch==='x86_64'?'x86_64 (unsupported)':this.profile.supported?'compatible 32-bit x86':'unsupported'),'Boot stage: '+this.bootStage,'Last serial activity: '+(this.lastSerialAt?Math.max(0,Math.round((Date.now()-this.lastSerialAt)/1000))+'s ago':'none'),'Health: '+this.health].join('\n');p.hidden=!p.hidden;}
 private async copyDiagnostics():Promise<void>{this.showDiagnostics();const t=document.getElementById('v86-diagnostics')?.textContent||'';try{await navigator.clipboard.writeText(t);this.term.writeln('[Diagnostics copied]');}catch(error){console.warn('[LinuxLab] Clipboard diagnostics copy failed:',error);this.term.writeln('[Diagnostics] Clipboard unavailable');}}
}
window.addEventListener('DOMContentLoaded',()=>{try{const vm=new V86LinuxTerminal();if (import.meta.env.DEV || location.hostname === '127.0.0.1' || location.hostname === 'localhost') window.linuxLabVM=vm;window.addEventListener('pagehide',()=>vm.destroy(),{once:true});}catch(e){console.error(e);const container=document.getElementById('v86-terminal-container');if(container){container.textContent='Unable to start the terminal runtime. Please reload the page and check your browser console for details.';container.style.color='#e2e8f0';container.style.padding='16px';}}});
