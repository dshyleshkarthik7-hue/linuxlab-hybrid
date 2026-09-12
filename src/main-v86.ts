import * as xtermModule from '@xterm/xterm';
import * as fitModule from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { attachGuestTelemetry, type GuestIdentity, type V86TelemetryTarget } from './v86-telemetry.ts';
import { VM_RESOURCE_POLICIES, VMRuntimeResourceEnforcer, type VMResourcePolicyName } from './engine/VMResourcePolicy.ts';
import { artifactForIsoUrl, fetchVerifiedIso } from './core/verified-iso-fetch.ts';

const TerminalCtor = xtermModule.Terminal;
const FitAddonCtor = fitModule.FitAddon;
declare global { interface Window { linuxLabVM?: V86LinuxTerminal; V86?: V86Constructor; } }
type V86Options = { wasm_path: string; memory_size: number; vga_memory_size: number; screen_container: HTMLElement; bios: { url: string }; vga_bios: { url: string }; cdrom: { buffer: ArrayBuffer }; boot_order: number; autostart: boolean; disable_speaker: boolean; net_device: { type: 'none' }; };
type V86 = V86TelemetryTarget & { keyboard_send_text?: (data: string) => void; serial0_send: (data: string) => void; stop?: () => void; destroy?: () => void; };
type V86Constructor = new (options: V86Options) => V86;
type GuestKind = 'alpine' | 'buildroot';
type Profile = { name: string; memoryMiB: number; cdrom: string; supported: boolean; note?: string; arch?: 'x86' | 'x86_64'; policy: VMResourcePolicyName; expectedGuest: GuestKind; };

const ALPINE_ISO = '/api/iso';
const ALPINE_VIRT_ISO = '/api/iso?image=virt';
const ULTRA_LIGHT_ISO = '/api/iso?image=linux4';

const PROFILES: Record<'developer' | 'virt' | 'linux4', Profile> = {
  developer: { name: 'Developer Alpine', memoryMiB: 1024, cdrom: ALPINE_ISO, supported: true, policy: 'developer', expectedGuest: 'alpine' },
  virt: { name: 'Alpine Virt 3.24.1', memoryMiB: 512, cdrom: ALPINE_VIRT_ISO, supported: true, arch: 'x86', note: 'Lightweight 32-bit Alpine Virt profile.', policy: 'virt', expectedGuest: 'alpine' },
  linux4: { name: 'Ultra Light Linux 4', memoryMiB: 256, cdrom: ULTRA_LIGHT_ISO, supported: true, arch: 'x86', note: 'Approx. 7.4 MB Buildroot-based practice image.', policy: 'linux4', expectedGuest: 'buildroot' },
};

function initialProfile(): Profile {
  const requested = new URLSearchParams(window.location.search).get('profile');
  if (requested === 'linux4') return PROFILES.linux4;
  if (requested === 'virt') return PROFILES.virt;
  return PROFILES.developer;
}

export class V86LinuxTerminal {
  private term: xtermModule.Terminal;
  private fitAddon: fitModule.FitAddon;
  private emulator: V86 | null = null;
  private telemetryDispose: (() => void) | null = null;
  private static runtimePromise: Promise<void> | null = null;
  private terminalDataDisposable: { dispose(): void } | null = null;
  private profile: Profile = initialProfile();
  private enforcer: VMRuntimeResourceEnforcer | null = null;
  private bootId = 0;
  private bootController: AbortController | null = null;
  private ready = false;
  private health: 'booting' | 'ready' | 'offline' = 'booting';
  private serial = '';
  private bootTimeout: number | null = null;
  private bootPromptTimer: number | null = null;
  private sessionTimer: number | null = null;
  private bootPromptSent = false;
  private bootStage = 'starting';
  private lastSerialAt = 0;
  private guestIdentity: GuestIdentity | null = null;

  constructor(containerId = 'v86-terminal-container') {
    if (!TerminalCtor || !FitAddonCtor) throw new Error('Terminal runtime failed to load');
    const container = document.getElementById(containerId);
    if (!container) throw new Error('Terminal container is missing');
    this.term = new TerminalCtor({ cursorBlink: true, fontSize: 14, convertEol: true, scrollback: 10000 });
    this.fitAddon = new FitAddonCtor();
    this.term.loadAddon(this.fitAddon);
    this.term.open(container);
    this.terminalDataDisposable = this.term.onData((data: string) => { if (this.canUseRuntime()) this.emulator?.serial0_send(data); });
    window.addEventListener('resize', () => this.fit());
    setTimeout(() => this.fit(), 100);
    this.bindControls();
    void this.start(this.profile);
  }

  private bindControls(): void {
    document.getElementById('btn-v86-alpine')?.addEventListener('click', () => void this.start(PROFILES.developer));
    document.getElementById('btn-v86-virt')?.addEventListener('click', () => void this.start(PROFILES.virt));
    document.getElementById('btn-v86-linux4')?.addEventListener('click', () => void this.start(PROFILES.linux4));
    document.getElementById('btn-v86-restart')?.addEventListener('click', () => void this.start(this.profile));
    document.getElementById('btn-v86-terminal')?.addEventListener('click', () => this.showTerminal());
    document.getElementById('btn-v86-screen')?.addEventListener('click', () => this.showScreen());
    document.getElementById('btn-v86-diagnostics')?.addEventListener('click', () => this.showDiagnostics());
    document.getElementById('btn-v86-copydiag')?.addEventListener('click', () => void this.copyDiagnostics());
  }

  private async start(profile: Profile): Promise<void> {
    const id = ++this.bootId;
    this.bootController?.abort();
    this.bootController = new AbortController();
    const signal = this.bootController.signal;
    await this.dispose();