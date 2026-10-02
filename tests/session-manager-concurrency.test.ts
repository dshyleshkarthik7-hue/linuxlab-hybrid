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
const timeoutSession = new SessionManager({ cpuMs: 5, memoryBytes: 1024, diskBytes: 1024, processCount: 8, timeoutMs: 60_000 });
await timeoutSession.start(async () => {});
await assert.rejects(() => timeoutSession.execute(async () => { await new Promise(resolve => setTimeout(resolve, 25)); }), /CPU time limit exceeded/);
await timeoutSession.stop();
await timeoutSession.destroy();
const restartSession = new SessionManager({ cpuMs: 1000, memoryBytes: 1024, diskBytes: 1024, processCount: 8, timeoutMs: 60_000 });
await restartSession.restart(async () => {}, async () => {});
assert.equal(restartSession.getState(), 'READY');
await restartSession.destroy();
const failedStart = new SessionManager();
await assert.rejects(() => failedStart.start(async () => { throw new Error('start failure'); }), /start failure/);
assert.equal(failedStart.getState(), 'STOPPED');
console.log('SessionManager concurrency checks passed');
