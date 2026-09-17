const ISO_URL='/api/iso?image=developer';
const FIRMWARE_BASE='/api/v86-firmware';
const RAM_BYTES=256*1024*1024;
const BOOT_TIMEOUT_MS=120000;
let emulator=null;
let starting=false;
const status=document.getElementById('dev-status');
const diagnostics=document.getElementById('dev-diagnostics');
const screen=document.getElementById('screen_container');
function setStatus(text){if(status)status.textContent=text}
function fail(error){setStatus('Could not start — check Reboot');if(diagnostics){diagnostics.hidden=false;diagnostics.textContent=`The Linux workspace could not start. ${error?.message||'Check your connection and try Reboot.'}`}}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
async function fetchAsset(url,signal){const response=await fetch(url,{cache:'no-store',signal});if(!response.ok)throw new Error(`Required VM asset failed to load: ${url} (${response.status})`);const bytes=await response.arrayBuffer();if(!bytes.byteLength)throw new Error(`Required VM asset is empty: ${url}`);return bytes}
async function waitForV86Loaded(vm,timeoutMs){const deadline=Date.now()+timeoutMs;while(Date.now()<deadline){if(vm?.cpu&&vm?.screen_adapter)return;await sleep(50)}throw new Error('v86 runtime did not initialize the CPU/display')}
async function waitForAlpine(vm,timeoutMs){const deadline=Date.now()+timeoutMs;if(typeof vm.wait_until_vga_screen_contains!=='function')throw new Error('v86 runtime does not support VGA readiness detection');while(Date.now()<deadline){try{await vm.wait_until_vga_screen_contains(/Alpine Linux|Welcome to Alpine|localhost login:/i,{timeout_msec:1000});return}catch{await sleep(100)}}throw new Error('Alpine Linux did not reach its login screen before the boot timeout')}
async function stopEmulator(){if(!emulator)return;try{await emulator.stop?.();await emulator.destroy?.()}catch(error){console.warn('Previous emulator cleanup failed',error)}emulator=null}
async function start(){if(starting)return;starting=true;await stopEmulator();setStatus('Starting…');if(diagnostics){diagnostics.hidden=true;diagnostics.textContent=''}try{if(!screen)throw new Error('VM screen container is missing');const Runtime=globalThis.V86Starter||globalThis.V86;if(typeof Runtime!=='function')throw new Error('Local v86 runtime did not expose a constructor');setStatus('Loading Alpine image…');const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),BOOT_TIMEOUT_MS);let isoBytes;try{isoBytes=await fetchAsset(ISO_URL,controller.signal)}finally{clearTimeout(timer)}setStatus('Creating Alpine VM…');emulator=new Runtime({wasm_path:'/v86.wasm',memory_size:RAM_BYTES,vga_memory_size:8*1024*1024,screen_container:screen,bios:{url:`${FIRMWARE_BASE}/seabios.bin`},vga_bios:{url:`${FIRMWARE_BASE}/vgabios.bin`},cdrom:{buffer:isoBytes},boot_order:0x213,fastboot:true,bootmenu:false,autostart:false,disable_speaker:true,net_device:{type:'none'}});await waitForV86Loaded(emulator,15000);setStatus('Booting Alpine Linux…');if(typeof emulator.run!=='function')throw new Error('Local v86 runtime does not expose run()');await emulator.run();await waitForAlpine(emulator,BOOT_TIMEOUT_MS);setStatus('Ready — start practicing');screen.focus()}catch(error){console.error(error);fail(error)}finally{starting=false}}
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
