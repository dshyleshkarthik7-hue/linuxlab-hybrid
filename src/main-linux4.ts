import * as xtermModule from '@xterm/xterm';
import * as fitModule from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const TerminalCtor = xtermModule.Terminal;
const FitAddonCtor = fitModule.FitAddon;

type V86 = {
  serial0_send: (data: string) => void;
  add_listener: (event: string, callback: (value?: number) => void) => void;
  run: () => void;
  keyboard_send_text?: (data: string) => void;
};

declare global { interface Window { V86?: new (options: Record<string, unknown>) => V86; } }

async function boot(): Promise<void> {
  const container = document.getElementById('linux4-terminal');
  const health = document.getElementById('linux4-health');
  const status = document.getElementById('linux4-status');
  const screen = document.getElementById('linux4-screen');
  if (!container || !health || !status || !screen || typeof TerminalCtor !== 'function' || typeof FitAddonCtor !== 'function') throw new Error('Linux 4 terminal runtime is unavailable');

  const term = new TerminalCtor({ cursorBlink: true, fontSize: 14, convertEol: true, scrollback: 10000 });
  const fit = new FitAddonCtor();
  term.loadAddon(fit);
  term.open(container);
  const resize = () => { try { fit.fit(); } catch {} };
  window.addEventListener('resize', resize);
  setTimeout(resize, 50);
  term.writeln('LinuxTerminal — Ultra Light Linux 4');
  status.textContent = 'Linux 4 • loading';

  const response = await fetch('/api/iso?image=linux4', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Linux 4 image request failed (${response.status})`);
  const iso = await response.arrayBuffer();
  if (!iso.byteLength) throw new Error('Linux 4 image is empty');

  const Runtime = window.V86;
  if (typeof Runtime !== 'function') throw new Error('Local v86 runtime did not load');

  let serial = '';
  let ready = false;
  const markReady = () => {
    if (ready) return;
    ready = true;
    health.dataset.state = 'ready';
    health.setAttribute('aria-label', 'Linux 4 ready');
    status.textContent = 'Linux 4 • ready';
  };

  const vm = new Runtime({
    wasm_path: '/v86.wasm',
    memory_size: 256 * 1024 * 1024,
    vga_memory_size: 8 * 1024 * 1024,
    screen_container: screen,
    bios: { url: '/seabios.bin' },
    vga_bios: { url: '/vgabios.bin' },
    cdrom: { buffer: iso },
    boot_order: 0x20,
    autostart: false,
    disable_speaker: true,
    net_device: { type: 'none' },
  });

  vm.add_listener('serial0-output-byte', (value?: number) => {
    if (typeof value !== 'number') return;
    const ch = String.fromCharCode(value & 255);
    serial = (serial + ch).slice(-16384);
    term.write(ch);
    if (/(?:login:|\$\s*$|#\s*$|Buildroot|Linux version)/im.test(serial)) markReady();
  });

  health.dataset.state = 'booting';
  status.textContent = 'Linux 4 • booting';
  vm.run();
}

window.addEventListener('DOMContentLoaded', () => {
  void boot().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    const health = document.getElementById('linux4-health');
    if (health) { health.dataset.state = 'offline'; health.setAttribute('aria-label', 'Linux 4 offline'); }
    const status = document.getElementById('linux4-status');
    if (status) status.textContent = `Linux 4 • ${message}`;
    const terminal = document.getElementById('linux4-terminal');
    if (terminal) terminal.textContent = `Linux 4 failed to start: ${message}`;
  });
});
