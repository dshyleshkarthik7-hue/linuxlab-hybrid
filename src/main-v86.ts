import * as xtermModule from '@xterm/xterm';
import * as fitModule from '@xterm/addon-fit';
// The npm package's public entry point does not export the emulator constructor.
// Load the version-matched browser bundle shipped with this deployment instead.
import '@xterm/xterm/css/xterm.css';

const TerminalCtor = (xtermModule as any).Terminal;
const FitAddonCtor = (fitModule as any).FitAddon;
const ALPINE_ISO = '/api/iso';
const ALPINE_VIRT_ISO = '/api/iso?image=virt';
const profileMemory=(profile:Profile)=>profile.memoryMiB;
type Profile = { name:string; memoryMiB:number; cdrom:string; supported:boolean; note?:string; arch?:'x86'|'x86_64' };
type V86 = { add_listener(name:string, cb:(value:number)=>void):void; serial0_send(data:string):void; stop?:()=>void; destroy?:()=>void };

export class V86LinuxTerminal {
 private term:any; private fitAddon:any; private emulator:V86|null=null;
 private static runtimePromise:Promise<void>|null=null;
 private terminalDataDisposable:{dispose():void}|null=null;
 private profile:Profile={name:'Developer Alpine',memoryMiB:1024,cdrom:ALPINE_ISO,supported:true};
 private bootId=0; private ready=false; private serial=''; private bootTimeout:number|null=null; private bootPromptSent=false; private bootPromptTimer:number|null=null;
 constructor(containerId='v86-terminal-container'){
  if(!TerminalCtor||!FitAddonCtor) throw new Error('Terminal runtime failed to load');
  const container=document.getElementById(containerId); if(!container) throw new Error('Terminal container is missing');
  this.term=new TerminalCtor({cursorBlink:true,fontSize:14,convertEol:true,scrollback:10000});
  this.fitAddon=new FitAddonCtor(); this.term.loadAddon(this.fitAddon); this.term.open(container);
  this.terminalDataDisposable=this.term.onData((d:string)=>this.emulator?.serial0_send(d));
  window.addEventListener('resize',()=>this.fit()); setTimeout(()=>this.fit(),100); this.bindControls();
 }
 private bindControls():void{
  document.getElementById('btn-v86-alpine')?.addEventListener('click',()=>void this.start({name:'Developer Alpine',memoryMiB:1024,cdrom:ALPINE_ISO,supported:true}));
  document.getElementById('btn-v86-virt')?.addEventListener('click',()=>void this.start({name:'Alpine Virt 3.24.1',memoryMiB:512,cdrom:ALPINE_VIRT_ISO,supported:true,arch:'x86',note:'Lightweight 32-bit Alpine Virt profile.'}));
  document.getElementById('btn-v86-restart')?.addEventListener('click',()=>void this.start(this.profile));
  document.getElementById('btn-v86-terminal')?.addEventListener('click',()=>this.showTerminal());
  document.getElementById('btn-v86-screen')?.addEventListener('click',()=>this.showScreen());
  document.getElementById('btn-v86-diagnostics')?.addEventListener('click',()=>this.showDiagnostics());
  document.getElementById('btn-v86-copydiag')?.addEventListener('click',()=>void this.copyDiagnostics());
 }
 private async start(profile:Profile):Promise<void>{
  // A new boot invalidates all callbacks from the previous VM.
  const id=++this.bootId; await this.dispose(); this.profile=profile; this.ready=false; this.serial=''; this.bootPromptSent=false; this.showTerminal(); this.term.clear();
  if(!profile.supported){this.showTerminal();this.term.clear();this.status(profile.name+' • incompatible with browser VM');this.monitor('Not booted • '+(profile.arch||'unknown architecture'));this.term.writeln('LinuxTerminal — '+profile.name);this.term.writeln('\r\n[Compatibility] '+(profile.note||'This image cannot run in this browser emulator.'));this.term.writeln('[Use Developer Alpine for the real VM.]');return;}
  this.status(profile.name+' • checking runtime'); this.term.writeln('LinuxTerminal — '+profile.name);
   await this.loadRuntime();
   if(id!==this.bootId)return;
   this.status(profile.name+' • checking image');
  try{
   const iso=await fetch(profile.cdrom,{method:'GET',headers:{Range:'bytes=0-0'},cache:'no-store',signal:AbortSignal.timeout(30000)});
   if(!iso.ok&&iso.status!==206) throw new Error('Linux image unavailable ('+iso.status+')');
   if(id!==this.bootId)return;
   const screen=document.getElementById('screen_container'); if(!screen)throw new Error('VM screen container is missing');
   this.status(profile.name+' • booting'); this.monitor(profile.memoryMiB+' MiB • starting');
   const Runtime=(window as any).V86;
   if(typeof Runtime!=='function') throw new Error('Local v86 runtime did not expose window.V86');
   const vm:any=new Runtime({wasm_path:'/v86.wasm',memory_size:profile.memoryMiB*1024*1024,vga_memory_size:8*1024*1024,screen_container:screen,bios:{url:'/seabios.bin'},vga_bios:{url:'/vgabios.bin'},cdrom:{url:profile.cdrom,async:true},boot_order:0x20,autostart:true,disable_speaker:true});
   this.emulator=vm as V86;
   vm.add_listener('serial0-output-byte',(byte:number)=>{if(id===this.bootId)this.serialOutput(byte);});
   this.bootTimeout=window.setTimeout(()=>{if(!this.ready&&id===this.bootId)this.error('Boot timed out. The VM started but did not reach a shell. Reboot and try again.');},300000);
   this.fit();
  }catch(e){this.error(e instanceof Error?e.message:String(e));}
 }
 private loadRuntime():Promise<void>{
  if(typeof (window as any).V86==='function') return Promise.resolve();
  if(V86LinuxTerminal.runtimePromise) return V86LinuxTerminal.runtimePromise;
  V86LinuxTerminal.runtimePromise=new Promise<void>((resolve,reject)=>{
   const existing=document.querySelector<HTMLScriptElement>('script[data-linuxlab-v86]');
   const finish=()=>typeof (window as any).V86==='function'?resolve():reject(new Error('Local libv86.js loaded but window.V86 was not exposed'));
   if(existing){if(typeof (window as any).V86==='function'){resolve();return;}existing.addEventListener('load',finish,{once:true});existing.addEventListener('error',()=>reject(new Error('Failed to load local libv86.js')),{once:true});return;}
   const script=document.createElement('script');script.dataset.linuxlabV86='true';script.src='/libv86.js';script.async=true;
   script.onload=finish;script.onerror=()=>reject(new Error('Failed to load /libv86.js'));
   document.head.appendChild(script);
  }).catch((error:unknown)=>{V86LinuxTerminal.runtimePromise=null;throw error;});
  return V86LinuxTerminal.runtimePromise;
 }
 private serialOutput(byte:number):void{const ch=String.fromCharCode(byte&255);this.serial=(this.serial+ch).slice(-16000);this.term.write(ch);if(!this.bootPromptSent&&/\bboot:\s*(?:\r?\n)?$/i.test(this.serial)){this.bootPromptSent=true;this.status(this.profile.name+' • starting Alpine');this.monitor(profileMemory(this.profile)+' MiB • bootloader');this.bootPromptTimer=window.setTimeout(()=>{this.bootPromptTimer=null;this.emulator?.serial0_send('\n');},250);}if(!this.ready&&/[#$>]\s*$/.test(this.serial.trim())){this.ready=true;if(this.bootTimeout!==null)clearTimeout(this.bootTimeout);this.bootTimeout=null;this.status(this.profile.name+' • ready');this.monitor(this.profile.memoryMiB+' MiB • ready');}}
 private showTerminal():void{const s=document.getElementById('screen_container'),t=document.getElementById('v86-terminal-container');if(s)s.hidden=true;if(t)t.hidden=false;this.fit();this.term.focus();}
 private showScreen():void{const s=document.getElementById('screen_container'),t=document.getElementById('v86-terminal-container');if(s)s.hidden=false;if(t)t.hidden=true;this.fit();}
 private status(t:string):void{const e=document.getElementById('v86-status');if(e)e.textContent=t;}
 private monitor(t:string):void{const e=document.getElementById('v86-monitor');if(e)e.textContent=t;}
 private fit():void{try{this.fitAddon.fit();}catch{}}
 private error(message:string):void{this.ready=false;if(this.bootTimeout!==null){clearTimeout(this.bootTimeout);this.bootTimeout=null;}if(this.bootPromptTimer!==null){clearTimeout(this.bootPromptTimer);this.bootPromptTimer=null;}this.status(this.profile.name+' • error');this.monitor('Boot failed');this.term.writeln('\r\n[VM] '+message);}
 private async dispose():Promise<void>{if(this.bootTimeout!==null){clearTimeout(this.bootTimeout);this.bootTimeout=null;}if(this.bootPromptTimer!==null){clearTimeout(this.bootPromptTimer);this.bootPromptTimer=null;}const vm=this.emulator;this.emulator=null;try{vm?.stop?.();vm?.destroy?.();}catch{}}
 public destroy():void{this.bootId++;void this.dispose();this.terminalDataDisposable?.dispose();this.terminalDataDisposable=null;try{this.term.dispose();}catch{}}
 private showDiagnostics():void{const p=document.getElementById('v86-diagnostics');if(!p)return;p.textContent=['VM diagnostics','Profile: '+this.profile.name,'VM mode: '+(this.profile.name==='Developer Alpine'?'primary':'optional compatibility'),'VM object: '+(this.emulator?'created':'not created'),'Runtime: local version-matched browser bundle','Shell detected: '+(this.ready?'yes':'waiting'),'ISO endpoint: '+this.profile.cdrom,'Architecture: '+(this.profile.arch==='x86_64'?'x86_64 (unsupported)':this.profile.supported?'compatible 32-bit x86':'unsupported')].join('\n');p.hidden=!p.hidden;}
 private async copyDiagnostics():Promise<void>{this.showDiagnostics();const t=document.getElementById('v86-diagnostics')?.textContent||'';try{await navigator.clipboard.writeText(t);this.term.writeln('[Diagnostics copied]');}catch{this.term.writeln('[Diagnostics] Clipboard unavailable');}}
}
window.addEventListener('DOMContentLoaded',()=>{try{const vm=new V86LinuxTerminal();(window as any).linuxLabVM=vm;window.addEventListener('pagehide',()=>vm.destroy(),{once:true});}catch(e){console.error(e);}});
