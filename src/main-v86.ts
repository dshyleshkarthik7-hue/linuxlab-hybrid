import * as xtermModule from '@xterm/xterm';
import * as fitModule from '@xterm/addon-fit';
import V86Starter from 'v86';
import '@xterm/xterm/css/xterm.css';

const TerminalCtor = (xtermModule as any).Terminal;
const FitAddonCtor = (fitModule as any).FitAddon;
const ALPINE_ISO = '/api/iso';
const ALPINE_VIRT_ISO = '/api/iso?image=virt';
type Profile = { name:string; memoryMiB:number; cdrom:string; supported:boolean; note?:string };
type V86 = { add_listener(name:string, cb:(value:number)=>void):void; serial0_send(data:string):void; stop?:()=>void; destroy?:()=>void };

export class V86LinuxTerminal {
 private term:any; private fitAddon:any; private emulator:V86|null=null;
 private terminalDataDisposable:{dispose():void}|null=null;
 private profile:Profile={name:'Developer Alpine',memoryMiB:1024,cdrom:ALPINE_ISO,supported:true};
 private bootId=0; private ready=false; private serial=''; private bootTimeout:number|null=null;
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
  document.getElementById('btn-v86-virt')?.addEventListener('click',()=>void this.start({name:'Alpine Virt 3.24',memoryMiB:512,cdrom:ALPINE_VIRT_ISO,supported:false,note:'This lightweight image is kept as an optional compatibility profile. Developer Alpine is the primary real Linux experience.'}));
  document.getElementById('btn-v86-restart')?.addEventListener('click',()=>void this.start(this.profile));
  document.getElementById('btn-v86-terminal')?.addEventListener('click',()=>this.showTerminal());
  document.getElementById('btn-v86-screen')?.addEventListener('click',()=>this.showScreen());
  document.getElementById('btn-v86-diagnostics')?.addEventListener('click',()=>this.showDiagnostics());
  document.getElementById('btn-v86-copydiag')?.addEventListener('click',()=>void this.copyDiagnostics());
 }
 private async start(profile:Profile):Promise<void>{
  // A new boot invalidates all callbacks from the previous VM.
  const id=++this.bootId; await this.dispose(); this.profile=profile; this.ready=false; this.serial=''; this.showTerminal(); this.term.clear();
  if(!profile.supported){this.error(profile.note||'Unsupported image');return;}
  this.status(profile.name+' • checking image'); this.term.writeln('LinuxTerminal — '+profile.name);
  try{
   const iso=await fetch(profile.cdrom,{method:'GET',headers:{Range:'bytes=0-0'},cache:'no-store',signal:AbortSignal.timeout(30000)});
   if(!iso.ok&&iso.status!==206) throw new Error('Linux image unavailable ('+iso.status+')');
   if(id!==this.bootId)return;
   const screen=document.getElementById('screen_container'); if(!screen)throw new Error('VM screen container is missing');
   this.status(profile.name+' • booting'); this.monitor(profile.memoryMiB+' MiB • starting');
   const vm:any=new (V86Starter as any)({memory_size:profile.memoryMiB*1024*1024,vga_memory_size:8*1024*1024,screen_container:screen,cdrom:{url:profile.cdrom,async:true},boot_order:0x20,autostart:true,disable_speaker:true});
   this.emulator=vm as V86;
   vm.add_listener('serial0-output-byte',(byte:number)=>{if(id===this.bootId)this.serialOutput(byte);});
   this.bootTimeout=window.setTimeout(()=>{if(!this.ready&&id===this.bootId)this.error('Boot timed out. Try the learning simulator or reboot the compatible image.');},180000);
   this.fit();
  }catch(e){this.error(e instanceof Error?e.message:String(e));}
 }
 private serialOutput(byte:number):void{const ch=String.fromCharCode(byte&255);this.serial=(this.serial+ch).slice(-16000);this.term.write(ch);if(!this.ready&&/[#$>]\s*$/.test(this.serial.trim())){this.ready=true;if(this.bootTimeout!==null)clearTimeout(this.bootTimeout);this.bootTimeout=null;this.status(this.profile.name+' • ready');this.monitor(this.profile.memoryMiB+' MiB • ready');}}
 private showTerminal():void{const s=document.getElementById('screen_container'),t=document.getElementById('v86-terminal-container');if(s)s.hidden=true;if(t)t.hidden=false;this.fit();this.term.focus();}
 private showScreen():void{const s=document.getElementById('screen_container'),t=document.getElementById('v86-terminal-container');if(s)s.hidden=false;if(t)t.hidden=true;this.fit();}
 private status(t:string):void{const e=document.getElementById('v86-status');if(e)e.textContent=t;}
 private monitor(t:string):void{const e=document.getElementById('v86-monitor');if(e)e.textContent=t;}
 private fit():void{try{this.fitAddon.fit();}catch{}}
 private error(message:string):void{this.ready=false;this.status(this.profile.name+' • error');this.monitor('Boot failed');this.term.writeln('\r\n[VM] '+message);}
 private async dispose():Promise<void>{if(this.bootTimeout!==null){clearTimeout(this.bootTimeout);this.bootTimeout=null;}const vm=this.emulator;this.emulator=null;try{vm?.stop?.();vm?.destroy?.();}catch{}}
 public destroy():void{this.bootId++;void this.dispose();this.terminalDataDisposable?.dispose();this.terminalDataDisposable=null;try{this.term.dispose();}catch{}}
 private showDiagnostics():void{const p=document.getElementById('v86-diagnostics');if(!p)return;p.textContent=['VM diagnostics','Profile: '+this.profile.name,'VM mode: '+(this.profile.name==='Developer Alpine'?'primary':'optional compatibility'),'VM object: '+(this.emulator?'created':'not created'),'Runtime: bundled npm package','Shell detected: '+(this.ready?'yes':'waiting'),'ISO endpoint: '+this.profile.cdrom,'Architecture: '+(this.profile.supported?'compatible x86':'unsupported 64-bit guest')].join('\n');p.hidden=!p.hidden;}
 private async copyDiagnostics():Promise<void>{this.showDiagnostics();const t=document.getElementById('v86-diagnostics')?.textContent||'';try{await navigator.clipboard.writeText(t);this.term.writeln('[Diagnostics copied]');}catch{this.term.writeln('[Diagnostics] Clipboard unavailable');}}
}
window.addEventListener('DOMContentLoaded',()=>{try{const vm=new V86LinuxTerminal();(window as any).linuxLabVM=vm;window.addEventListener('pagehide',()=>vm.destroy(),{once:true});}catch(e){console.error(e);}});
