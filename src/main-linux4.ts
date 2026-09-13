import * as xtermModule from '@xterm/xterm';
import * as fitModule from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { artifactForIsoUrl, fetchVerifiedIso } from './core/verified-iso-fetch.ts';
import { VM_RESOURCE_POLICIES, VMRuntimeResourceEnforcer } from './engine/VMResourcePolicy.ts';

const TerminalCtor = xtermModule.Terminal;
const FitAddonCtor = fitModule.FitAddon;
type V86 = { add_listener: (event: string, callback: (value?: number) => void) => void; stop?: () => void; destroy?: () => void };
type Linux4RuntimeConfig = { profile: 'linux4'; memoryBytes: number; vgaMemoryBytes: number; networkEnabled: false; integrityVerified: boolean; guestReady: boolean };
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
  term.writeln('LinuxTerminal — Ultra Light Linux 4'); status.textContent = 'Linux 4 • verifying image'; health.dataset.state = 'booting';

  const controller = new AbortController();
  const fetchTimeout = window.setTimeout(() => controller.abort(), 90_000);
  const enforcer = new VMRuntimeResourceEnforcer(POLICY);
  let vm: V86 | null = null;
  let bootTimer: number | null = null;
  let sessionTimer: number | null = null;
  const config: Linux4RuntimeConfig = { profile: 'linux4', memoryBytes: enforcer.memoryBytes, vgaMemoryBytes: enforcer.vgaMemoryBytes, networkEnabled: false, integrityVerified: false, guestReady: false };
  window.__linux4VmConfig = config;
  const cleanup = () => { enforcer.stop(); if (bootTimer !== null) window.clearTimeout(bootTimer); if (sessionTimer !== null) window.clearTimeout(sessionTimer); window.clearTimeout(fetchTimeout); window.removeEventListener('resize', resize); try { vm?.stop?.(); vm?.destroy?.(); } catch {} };
  try {
    const artifact = artifactForIsoUrl(ISO_URL);
    const iso = await fetchVerifiedIso(ISO_URL, controller.signal);
    if (!iso.byteLength) throw new Error('Linux 4 image is empty');
    config.integrityVerified = true;
    status.textContent = `Linux 4 • integrity verified (${artifact.version})`;
    const Runtime = window.V86;
    if (typeof Runtime !== 'function') throw new Error('Local v86 runtime did not load');
    const V86Runtime = Runtime;
    let serial = ''; let guestReady = false;
    const markGuestReady = () => { if (guestReady || !config.integrityVerified) return; guestReady = true; config.guestReady = true; if (bootTimer !== null) window.clearTimeout(bootTimer); health.dataset.state = 'ready'; health.setAttribute('aria-label', 'Linux 4 ready'); status.textContent = 'Linux 4 • ready'; };
    vm = new V86Runtime({ wasm_path: '/v86.wasm', memory_size: enforcer.memoryBytes, vga_memory_size: enforcer.vgaMemoryBytes, screen_container: screen, bios: { url: '/seabios.bin' }, vga_bios: { url: '/vgabios.bin' }, cdrom: { buffer: iso }, boot_order: 0x20, autostart: true, disable_speaker: true, net_device: { type: 'none' } });
    bootTimer = window.setTimeout(() => { if (!guestReady) { cleanup(); health.dataset.state = 'offline'; status.textContent = 'Linux 4 • boot timeout'; } }, POLICY.bootTimeoutMs);
    sessionTimer = window.setTimeout(() => { cleanup(); health.dataset.state = 'offline'; status.textContent = 'Linux 4 • session limit reached'; }, enforcer.remainingSessionMs());
    vm.add_listener('serial0-output-byte', (value?: number) => {
      if (typeof value !== 'number' || enforcer.isStopped()) return;
      if (!enforcer.acceptSerialByte(1)) { cleanup(); health.dataset.state = 'offline'; status.textContent = 'Linux 4 • serial limit reached'; return; }
      const ch = String.fromCharCode(value & 255); serial = (serial + ch).slice(-16384);
      const output = enforcer.acceptOutput(ch); if (output.value) term.write(output.value);
      if (/(?:ID=buildroot|NAME=Buildroot|Buildroot|Linux version|localhost login:|\[root@[^\]]+\]|#\s*$)/im.test(serial)) markGuestReady();
    });
  } catch (error) { cleanup(); health.dataset.state = 'offline'; health.setAttribute('aria-label', 'Linux 4 offline'); status.textContent = `Linux 4 • ${error instanceof Error ? error.message : String(error)}`; throw error; }
}
window.addEventListener('DOMContentLoaded', () => { void boot().catch(error => { const message = error instanceof Error ? error.message : String(error); const terminal = document.getElementById('linux4-terminal'); if (terminal && !terminal.querySelector('.xterm')) terminal.textContent = `Linux 4 failed to start: ${message}`; }); });
