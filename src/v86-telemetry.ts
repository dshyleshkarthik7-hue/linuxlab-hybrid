import { GuestTelemetryBridge, type GuestTelemetrySnapshot } from './observability/GuestTelemetryBridge.ts';

export interface V86TelemetryTarget {
  add_listener(name: 'serial0-output-byte' | 'emulator-ready', callback: (value?: number) => void): void;
  serial0_send(data: string): void;
}
export interface GuestIdentity { isAlpine: boolean; }
export interface GuestTelemetryCallbacks { onTelemetry?: (snapshot: GuestTelemetrySnapshot) => void; onIdentity?: (identity: GuestIdentity) => void; }

const TELEMETRY_REQUEST = "printf '__LT_TELEMETRY__\\n'; head -1 /proc/stat; uname -srm; cat /proc/uptime; cat /proc/loadavg; grep -E '^(MemTotal|MemAvailable):' /proc/meminfo; df -k / | tail -1; printf '__LT_END__\\n'; printf '__LT_IDENTITY__\\n'; cat /etc/os-release 2>/dev/null; printf '__LT_ID_END__\\n'";
const MAX_IDENTITY_BUFFER = 4096;
const REQUEST_DELAY_MS = 2000;
const POLL_INTERVAL_MS = 10000;

export function attachGuestTelemetry(vm: V86TelemetryTarget, callbacks: GuestTelemetryCallbacks = {}): () => void {
  const bridge = new GuestTelemetryBridge();
  let identityBuffer = '';
  let requestTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  const collect = (): void => {
    if (disposed) return;
    try { vm.serial0_send(TELEMETRY_REQUEST); }
    catch (error) { console.debug('[LinuxTerminal] guest telemetry request failed', error); }
  };

  const parseIdentityFrames = (): void => {
    const startMarker = '__LT_IDENTITY__';
    const endMarker = '__LT_ID_END__';
    for (;;) {
      const start = identityBuffer.indexOf(startMarker);
      if (start < 0) {
        identityBuffer = identityBuffer.slice(-startMarker.length + 1);
        return;
      }
      const end = identityBuffer.indexOf(endMarker, start + startMarker.length);
      if (end < 0) {
        identityBuffer = identityBuffer.slice(start);
        return;
      }
      const release = identityBuffer.slice(start + startMarker.length, end).slice(0, MAX_IDENTITY_BUFFER);
      const isAlpine = /(?:^|\n)ID=alpine(?:\n|$)/i.test(release) || /(?:^|\n)ID_LIKE=.*\balpine\b/i.test(release);
      callbacks.onIdentity?.({ isAlpine });
      identityBuffer = identityBuffer.slice(end + endMarker.length);
    }
  };

  const onSerial = (value?: number): void => {
    if (disposed || typeof value !== 'number') return;
    const char = String.fromCharCode(value & 0xff);
    const snapshot = bridge.feed(char);
    if (snapshot) callbacks.onTelemetry?.(snapshot);
    identityBuffer = (identityBuffer + char).slice(-MAX_IDENTITY_BUFFER);
    parseIdentityFrames();
  };

  const onReady = (): void => {
    if (disposed || requestTimer !== null) return;
    requestTimer = setTimeout(() => { requestTimer = null; collect(); }, REQUEST_DELAY_MS);
    if (pollTimer === null) pollTimer = setInterval(collect, POLL_INTERVAL_MS);
  };

  vm.add_listener('serial0-output-byte', onSerial);
  vm.add_listener('emulator-ready', onReady);

  return () => {
    disposed = true;
    if (requestTimer !== null) clearTimeout(requestTimer);
    if (pollTimer !== null) clearInterval(pollTimer);
    requestTimer = null;
    pollTimer = null;
    identityBuffer = '';
  };
}
