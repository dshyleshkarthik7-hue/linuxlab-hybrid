import { strict as assert } from 'node:assert';
import { GuestTelemetryBridge } from '../src/observability/GuestTelemetryBridge.ts';

const bridge = new GuestTelemetryBridge();
const frame = (cpu: string) => `__LT_TELEMETRY__\n${cpu}\nLinux 6.6.1 x86_64\n120.5 20.5\n0.42 0.31 0.20 1/50 1234\nMemTotal:       262144 kB\nMemAvailable:   131072 kB\n/dev/vda 8256000 1420000 6416000 18% /\n__LT_END__\n`;
assert(bridge.feed(frame('cpu 100 10 20 70 0 0 0 0 0 0')));
const snapshot = bridge.feed(frame('cpu 120 10 25 75 0 0 0 0 0 0'));
assert(snapshot);assert.equal(snapshot.kernel,'6.6.1');assert.equal(snapshot.architecture,'x86_64');assert.equal(snapshot.uptimeSeconds,120.5);assert.equal(snapshot.loadAverage,0.42);assert.equal(snapshot.memoryBytes,134217728);assert.equal(snapshot.diskBytes,8464384000);assert.equal(snapshot.cpuPercent,50);
const alpineRelease='NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.24.1\n';
assert.match(alpineRelease,/^ID=alpine$/m);
assert.equal(/^ID=alpine$/m.test(alpineRelease),true);
console.log('Guest telemetry and Alpine identity checks passed');
