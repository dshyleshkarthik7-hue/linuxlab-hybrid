import { strict as assert } from 'node:assert';
import { GuestTelemetryBridge } from '../src/observability/GuestTelemetryBridge.ts';
import { attachGuestTelemetry, type V86TelemetryTarget } from '../src/v86-telemetry.ts';

const bridge = new GuestTelemetryBridge();
const frame = (cpu: string) => `__LT_TELEMETRY__\n${cpu}\nLinux 6.6.1 x86_64\n120.5 20.5\n0.42 0.31 0.20 1/50 1234\nMemTotal:       262144 kB\nMemAvailable:   131072 kB\n/dev/vda 8256000 1420000 6416000 18% /\n__LT_END__\n`;
assert(bridge.feed(frame('cpu 100 10 20 70 0 0 0 0 0 0')));
const snapshot = bridge.feed(frame('cpu 120 10 15 85 0 0 0 0 0 0'));
assert(snapshot);
assert.equal(snapshot.kernel, '6.6.1');
assert.equal(snapshot.architecture, 'x86_64');
assert.equal(snapshot.uptimeSeconds, 120.5);
assert.equal(snapshot.loadAverage, 0.42);
assert.equal(snapshot.memoryBytes, 134217728);
assert.equal(snapshot.diskBytes, 8256000 * 1024);
assert.equal(snapshot.cpuPercent, 50);
for (const malformed of ['', '__LT_TELEMETRY__\n', '__LT_TELEMETRY__\nnot cpu\n__LT_END__\n', '__LT_TELEMETRY__\n' + 'x'.repeat(100_000)]) assert.doesNotThrow(() => bridge.feed(malformed));

const listeners = new Map<string, (value?: number) => void>();
const vm: V86TelemetryTarget = {
  add_listener(name, callback) { listeners.set(name, callback); },
  remove_listener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
};
let identity: { kind: string; isAlpine: boolean; release: string } | undefined;
const dispose = attachGuestTelemetry(vm, { onIdentity: value => { identity = value; } });
const alpine = '__LT_IDENTITY__\nID=alpine\nEVIL=ignored\n__LT_ID_END__\n';
for (const char of alpine) listeners.get('serial0-output-byte')?.(char.charCodeAt(0));
assert.deepEqual(identity, { kind: 'alpine', isAlpine: true, release: 'ID=alpine\nEVIL=ignored\n' });
dispose();
assert.equal(listeners.has('serial0-output-byte'), false);
console.log('Passive guest telemetry checks passed');
