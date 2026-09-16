const ISO_URL='/api/iso?image=developer';
const RAM_BYTES=1024*1024*1024;
const BOOT_TIMEOUT_MS=120000;
let emulator=null;
const status=document.getElementById('dev-status');
const diagnostics=document.getElementById('dev-diagnostics');
const screen=document.getElementById('screen_container');
function setStatus(text){if(status)status.textContent=text}
function fail(message){setStatus('Boot failed');if(diagnostics){diagnostics.hidden=false;diagnostics.textContent=message}}
function waitForVga(vm){if(typeof vm.wait_until_vga_screen_contains!=='function')return Promise.reject(new Error('v86 VGA readiness API unavailable'));return vm.wait_until_vga_screen_contains(/Alpine Linux|Welcome to Alpine|localhost login:/i,{timeout_msec:BOOT_TIMEOUT_MS})}
async function start(){
  if(emulator){try{emulator.stop?.();emulator.destroy?.()}catch{}}
  emulator=null;
  setStatus('Starting Developer Alpine…');
  if(diagnostics){diagnostics.hidden=true;diagnostics.textContent=''}
  try{
    if(typeof V86Starter!=='function')throw new Error('Local v86 runtime is unavailable');
    emulator=new V86Starter({wasm_path:'/v86.wasm',memory_size:RAM_BYTES,vga_memory_size:8*1024*1024,screen_container:screen,bios:{url:'/seabios.bin'},vga_bios:{url:'/vgabios.bin'},cdrom:{url:ISO_URL},boot_order:0x213,fastboot:true,bootmenu:false,autostart:true,disable_speaker:true,net_device:{type:'none'}});
    setStatus('Booting Developer Alpine…');
    await waitForVga(emulator);
    setStatus('Alpine ready • Developer environment booted');
    if(diagnostics){diagnostics.hidden=false;diagnostics.textContent='Profile: Developer Alpine\nMemory: 1024 MiB\nNetwork: disabled\nIntegrity: not verified in browser (by design)\nGuest: Alpine VGA boot signature detected\nTooling: verify with `gcc --version` and `nano --version` inside the guest.'}
  }catch(error){fail(error instanceof Error?error.message:'Developer Alpine failed to boot')}
}
document.getElementById('dev-restart')?.addEventListener('click',()=>void start());
void start();
