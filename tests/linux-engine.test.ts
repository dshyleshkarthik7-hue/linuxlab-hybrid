import { strict as assert } from 'node:assert';
import { InBrowserLinuxEngine } from '../src/engine/LinuxEngine.ts';

async function run() {
  const e = new InBrowserLinuxEngine();

  assert.equal(await e.execute('pwd'), '/root');
  assert.equal(await e.execute('cd /tmp && pwd'), '/tmp');
  assert.equal(await e.execute('cd /root && pwd'), '/root');

  assert.equal(await e.execute('echo hi > f && cat f'), 'hi');
  assert.equal((await e.execute('echo alpha | grep alpha')).trim(), 'alpha');
  assert.equal((await e.execute('echo alpha | grep beta')).trim(), '');

  assert.equal(await e.execute('touch a && cp a b && mv b c && cat c'), '');
  const found = await e.execute('find /root -name main.c');
  assert.ok(found.includes('main.c'));

  const ls = await e.execute('ls -la');
  assert.ok(ls.includes('main.c'));

  console.log('LinuxLab happy-path engine checks passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
