import { GuestTelemetryBridge, type GuestTelemetrySnapshot } from './observability/GuestTelemetryBridge.ts';

export interface V86TelemetryTarget {
  add_listener(name: 'serial0-output-byte' | 'emulator-ready', callback: (value?: number) => void): void;
  serial0_send(data: string): void;
}
export type GuestIdentityKind = 'alpine' | 'buildroot' | 'unknown';
export interface GuestIdentity { kind: GuestIdentityKind; isAlpine: boolean; release: string; }
export interface GuestTelemetryCallbacks { onTelemetry?: (snapshot: GuestTelemetrySnapshot) => void; onIdentity?: (identity: GuestIdentity) => void; }

const MAX_IDENTITY_BUFFER = 8192;

/**
 * Passive telemetry bridge. It deliberately never writes commands to serial0:
 * serial0 is the interactive terminal, so polling it would paste diagnostics
 * into the user's shell and corrupt the terminal session.
 */
export function attachGuestTelemetry(vm: V86TelemetryTarget, callbacks: GuestTelemetryCallbacks = {}): () => void {
  const bridge = new GuestTelemetryBridge();
  let identityBuffer = '';
  let disposed = false;

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
      const isBuildroot = /(?:^|\n)ID=buildroot(?:\n|$)/i.test(release) || /(?:^|\n)NAME=.*buildroot/i.test(release);
      callbacks.onIdentity?.({ kind: isAlpine ? 'alpine' : isBuildroot ? 'buildroot' : 'unknown', isAlpine, release });
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

  vm.add_listener('serial0-output-byte', onSerial);
  return () => { disposed = true; identityBuffer = ''; };
}
