const ISO_URL='/api/iso?image=developer';
const FIRMWARE_BASE='/api/v86-firmware';
const ISO_SIZE=691011584;
const RAM_BYTES=1024*1024*1024;
const BOOT_TIMEOUT_MS=300000;
let emulator=null;
let starting=false;
const status=document.getElementById('dev-status');
const monitor=document.getElementById('dev-monitor');
const health=document.getElementById('dev-health');
const diagnostics=document.getElementById('dev-diagnostics');
const screen=document.getElementById('screen_container');
function setStatus(text){if(status)status.textContent=text}
function setMonitor(text){if(monitor)monitor.textContent=text}
function setHealth(state){if(health){health.dataset.state=state;health.setAttribute('aria-label',state==='ready'?'VM working':state==='booting'?'VM booting':'VM offline')}}
function fail(error){console.error(error);setHealth('offline');setStatus('Offline — check Reboot');setMonitor('Developer Alpine • offline');if(diagnostics){diagnostics.hidden=false;diagnostics.textContent=`The Developer Alpine workspace could not start. ${error?.message||'Check your connection and try Reboot.'}`}}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function waitForV86Loaded(vm,timeoutMs){return new Promise((resolve,reject)=>{let settled=false;let timer;const cleanup=()=>{if(timer)clearTimeout(timer);vm.remove_listener?.('emulator-loaded',onLoaded)};const finish=error=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve()};const onLoaded=()=>finish();try{vm.add_listener('emulator-loaded',onLoaded);if(vm?.cpu&&vm?.screen_adapter){finish();return}timer=setTimeout(()=>finish(new Error('v86 emulator initialization timed out')),timeoutMs)}catch(error){finish(error)}})}
async function waitForAlpine(vm,timeoutMs){const deadline=Date.now()+timeoutMs;if(typeof vm.wait_until_vga_screen_contains!=='function')throw new Error('v86 runtime does not support VGA readiness detection');while(Date.now()<deadline){try{await vm.wait_until_vga_screen_contains(/Alpine Linux|Welcome to Alpine|localhost login:|login:/i,{timeout_msec:1000});return}catch{await sleep(100)}}throw new Error('Alpine Linux did not reach its login screen before the boot timeout')}
async function stopEmulator(){if(!emulator)return;try{await emulator.stop?.();await emulator.destroy?.()}catch(error){console.warn('Previous emulator cleanup failed',error)}emulator=null}
async function start(){if(starting)return;starting=true;await stopEmulator();setHealth('booting');setStatus('Starting…');setMonitor('Developer Alpine • 1024 MiB • loading');if(diagnostics){diagnostics.hidden=true;diagnostics.textContent=''}try{if(!screen)throw new Error('VM screen container is missing');const Runtime=globalThis.V86Starter||globalThis.V86;if(typeof Runtime!=='function')throw new Error('Local v86 runtime did not expose a constructor');setStatus('Loading Developer Alpine image…');const RuntimeVm=new Runtime({wasm_path:'/v86.wasm',memory_size:RAM_BYTES,vga_memory_size:8*1024*1024,screen_container:screen,bios:{url:`${FIRMWARE_BASE}/seabios.bin`},vga_bios:{url:`${FIRMWARE_BASE}/vgabios.bin`},cdrom:{url:ISO_URL,async:true,size:ISO_SIZE},boot_order:0x213,fastboot:true,bootmenu:false,autostart:false,disable_speaker:true,net_device:{type:'none'}});emulator=RuntimeVm;setStatus('Initializing v86 runtime…');setMonitor('Developer Alpine • waiting for v86');await waitForV86Loaded(emulator,BOOT_TIMEOUT_MS);setStatus('Booting Alpine Linux…');setMonitor('Developer Alpine • booting • 1024 MiB');if(typeof emulator.run!=='function')throw new Error('Local v86 runtime does not expose run()');await emulator.run();setStatus('Checking Alpine guest…');await waitForAlpine(emulator,BOOT_TIMEOUT_MS);setHealth('ready');setStatus('Ready — start practicing');setMonitor('Developer Alpine • running • 1024 MiB');screen.focus()}catch(error){fail(error)}finally{starting=false}}
function sendScancodes(codes){if(!emulator||typeof emulator.keyboard_send_scancodes!=='function')return;void emulator.keyboard_send_scancodes(codes);screen?.focus?.()}
function addShortcut(id,codes){document.getElementById(id)?.addEventListener('click',()=>sendScancodes(codes))}
addShortcut('shortcut-ctrl-x',[0x1d,0x2d,0xad,0x9d]);
addShortcut('shortcut-ctrl-o',[0x1d,0x18,0x98,0x9d]);
addShortcut('shortcut-ctrl-c',[0x1d,0x2e,0xae,0x9d]);
addShortcut('shortcut-ctrl-l',[0x1d,0x26,0xa6,0x9d]);
addShortcut('shortcut-tab',[0x0f,0x8f]);
addShortcut('shortcut-esc',[0x01,0x81]);
addShortcut('shortcut-enter',[0x1c,0x9c]);
document.getElementById('dev-restart')?.addEventListener('click',()=>void start());
void start();
