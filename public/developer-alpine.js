const ISO_URL='/api/iso?image=developer';
const RAM_BYTES=512*1024*1024;
const BOOT_TIMEOUT_MS=120000;
const SCREEN_POLL_MS=100;
let emulator=null;
let starting=false;
const status=document.getElementById('dev-status');
const diagnostics=document.getElementById('dev-diagnostics');
const screen=document.getElementById('screen_container');
function setStatus(text){if(status)status.textContent=text}
function fail(error){setStatus('Could not start — check Reboot');if(diagnostics){diagnostics.hidden=false;diagnostics.textContent=`The Linux workspace could not start. ${error?.message||'Check your connection and try Reboot.'}`}}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
async function waitForScreen(vm){
  const deadline=Date.now()+BOOT_TIMEOUT_MS;
  while(Date.now()<deadline){
    if(vm.screen_adapter&&typeof vm.screen_adapter.get_text_screen==='function'){
      const remaining=deadline-Date.now();
      const ready=await vm.wait_until_vga_screen_contains(/Alpine Linux|Welcome to Alpine|localhost login:/i,{timeout_msec:Math.min(5000,Math.max(1000,remaining))});
      if(ready)return;
    }
    await sleep(SCREEN_POLL_MS);
  }
  throw new Error('Linux workspace timed out while the display was initializing');
}
async function stopEmulator(){
  if(!emulator)return;
  try{await emulator.stop?.();await emulator.destroy?.()}catch(error){console.warn('Previous emulator cleanup failed',error)}
  emulator=null;
}
async function start(){
  if(starting)return;
  starting=true;
  await stopEmulator();
  setStatus('Starting…');
  if(diagnostics){diagnostics.hidden=true;diagnostics.textContent=''}
  try{
    const V86Runtime=globalThis.V86;
    if(typeof V86Runtime!=='function')throw new Error('Linux workspace runtime failed to load');
    emulator=new V86Runtime({wasm_path:'/v86.wasm',memory_size:RAM_BYTES,vga_memory_size:8*1024*1024,screen_container:screen,bios:{url:'/seabios.bin'},vga_bios:{url:'/vgabios.bin'},cdrom:{url:ISO_URL},boot_order:0x213,fastboot:true,bootmenu:false,autostart:true,disable_speaker:true,net_device:{type:'none'}});
    setStatus('Booting Alpine Linux…');
    await waitForScreen(emulator);
    setStatus('Ready — start practicing');
  }catch(error){console.error(error);fail(error)}
  finally{starting=false}
}
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
