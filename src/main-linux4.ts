import * as xtermModule from '@xterm/xterm';
import * as fitModule from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { artifactForIsoUrl, fetchVerifiedIso } from './core/verified-iso-fetch.ts';
import { VM_RESOURCE_POLICIES, VMRuntimeResourceEnforcer } from './engine/VMResourcePolicy.ts';

const TerminalCtor = xtermModule.Terminal;
const FitAddonCtor = fitModule.FitAddon;
type V86 = { serial0_send: (data: string) => void; add_listener: (event: string, callback: (value?: number) => void) => void; keyboard_send_text?: (data: string) => void; stop?: () => void; destroy?: () => void; };
type Linux4RuntimeConfig = { profile: 'linux4'; memoryBytes: number; vgaMemoryBytes: number; networkEnabled: false; integrityVerified: boolean; };
declare global { interface Window { V86?: new (options: Record<string, unknown>) => V86; __linux4VmConfig?: Linux4RuntimeConfig; } }

const POLICY = VM_RESOURCE_POLICIES.linux4;
const ISO_URL = '/api/iso?image=linux4';

async function boot(): Promise<void> {
  const container = document.getElementById('linux4-terminal');
  const health = document.getElementById('linux4-health');
  const status = document.getElementById('linux4-status');
  const screen = document.getElementById('linux4-screen');
  if (!container || !health || !status || !screen || !TerminalCtor || !FitAddonCtor) throw new Error('Linux 4 terminal runtime is unavailable');
  const term = new TerminalCtor({ cursorBlink: true, fontSize: 14, convertEol: true, scrollback: 10000 });
  const fit = new FitAddonCtor(); term.loadAddon(fit); term.open(container);
  const resize = () => { try { fit.fit(); } catch {} };
  window.addEventListener('resize', resize); setTimeout(resize, 50);
  term.writeln('LinuxTerminal — Ultra Light Linux 4');
  status.textContent = 'Linux 4 • verifying image'; health.dataset.state = 'booting';

  const controller = new AbortController();
  const fetchTimeout = window.setTimeout(() => controller.abort(), 90_000);
  const enforcer = new VMRuntimeResourceEnforcer(POLICY);
  let vm: V86 | null = null;
  let bootTimer: number | null = null;
  const config: Linux4RuntimeConfig = { profile: 'linux4', memoryBytes: enforcer.memoryBytes, vgaMemoryBytes: enforcer.vgaMemoryBytes, networkEnabled: false, integrityVerified: false };
  window.__linux4VmConfig = config;
  const stopVm = () => { enforcer.stop(); if (bootTimer !== null) window.clearTimeout(bootTimer); try { vm?.stop?.(); vm?.destroy?.(); } catch {} };
  const fail = (message: string): never => { stopVm(); health.dataset.state = 'offline'; health.setAttribute('aria-label', 'Linux 4 offline'); status.textContent = `Linux 4 • ${message}`; throw new Error(message); };

  try {
    const artifact = artifactForIsoUrl(ISO_URL);
    const iso = await fetchVerifiedIso(ISO_URL, controller.signal);
    if (!iso.byteLength) fail('Linux 4 image is empty');
    config.integrityVerified = true;
    status.textContent = `Linux 4 • integrity verified (${artifact.version})`;
    const Runtime = window.V86;
    if (typeof Runtime !== 'function') fail('Local v86 runtime did not load');
    let serial = '';
    let guestReady = false;
    window.setTimeout(() => { if (!enforcer.isStopped()) { stopVm(); health.dataset.state = 'offline'; status.textContent = 'Linux 4 • session limit reached'; } }, enforcer.remainingSessionMs());
    const markGuestReady = () => { if (guestReady || !config.integrityVerified) return; guestReady = true; if (bootTimer !== null) { window.clearTimeout(bootTimer); bootTimer = null; } health.dataset.state = 'ready'; health.setAttribute('aria-label', 'Linux 4 ready'); status.textContent = 'Linux 4 • ready'; };
    vm = new Runtime({ wasm_path: '/v86.wasm', memory_size: enforcer.memoryBytes, vga_memory_size: enforcer.vgaMemoryBytes, screen_container: screen, bios: { url: '/seabios.bin' }, vga_bios: { url: '/vgabios.bin' }, cdrom: { buffer: iso }, boot_order: 0x20, autostart: true, disable_speaker: true, net_device: { type: 'none' } });
    bootTimer = window.setTimeout(() => { if (!guestReady) { stopVm(); health.dataset.state = 'offline'; status.textContent = 'Linux 4 • boot timeout'; } }, POLICY.bootTimeoutMs);
    vm.add_listener('serial0-output-byte', (value?: number) => {
      if (typeof value !== 'number') return;
      if (!enforcer.acceptSerialByte(1)) { stopVm(); health.dataset.state = 'offline'; status.textContent = 'Linux 4 • serial limit reached'; return; }
      const ch = String.fromCharCode(value & 255); serial = (serial + ch).slice(-16384);
      const output = enforcer.acceptOutput(ch); if (output.value) term.write(output.value);
      if (/(?:ID=buildroot|NAME=Buildroot|Buildroot|localhost login:|\[root@[^\]]+\]|#\s*$)/im.test(serial)) markGuestReady();
    });
  } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
  finally { window.clearTimeout(fetchTimeout); }
}
window.addEventListener('DOMContentLoaded', () => { void boot().catch(error => { const message = error instanceof Error ? error.message : String(error); const health = document.getElementById('linux4-health'); if (health) { health.dataset.state = 'offline'; health.setAttribute('aria-label', 'Linux 4 offline'); } const status = document.getElementById('linux4-status'); if (status) status.textContent = `Linux 4 • ${message}`; const terminal = document.getElementById('linux4-terminal'); if (terminal && !terminal.querySelector('.xterm')) terminal.textContent = `Linux 4 failed to start: ${message}`; }); });
