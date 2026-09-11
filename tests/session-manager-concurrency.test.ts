import { strict as assert } from 'node:assert';
import { SessionManager } from '../src/core/SessionManager.ts';

const events: string[] = [];
const session = new SessionManager({ cpuMs: 1000, memoryBytes: 1024, diskBytes: 1024, processCount: 8, timeoutMs: 60_000 }, async () => { events.push('stop'); });
await Promise.all([
  session.start(async () => { events.push('start'); }),
  session.start(async () => { events.push('duplicate-start'); }),
]);
assert.equal(session.getState(), 'READY');
assert.equal(events.filter(e => e === 'start').length, 1);
assert.equal(events.includes('duplicate-start'), false);

await session.execute(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
await assert.rejects(() => Promise.all([
  session.execute(async () => { await new Promise(resolve => setTimeout(resolve, 25)); }),
  session.execute(async () => undefined),
]));

await Promise.all([session.stop(), session.stop(), session.destroy()]);
assert.equal(session.getState(), 'STOPPED');
console.log('SessionManager concurrency checks passed');
