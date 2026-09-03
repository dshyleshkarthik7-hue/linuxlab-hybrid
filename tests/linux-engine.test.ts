import { strict as assert } from 'node:assert';
import { InBrowserLinuxEngine } from '../src/engine/LinuxEngine.ts';

async function run() {
  const e = new InBrowserLinuxEngine();

  assert.equal(await e.execute('pwd'), '/root');
  assert.equal(await e.execute('cd /tmp && pwd'), '/tmp');
  assert.equal(await e.execute('cd /root && pwd'), '/root');

  assert.equal(await e.execute('echo hi > f && cat f'), 'hi');
  assert.equal(await e.execute('cat missing && echo should-not-run'), 'cat: missing: No such file or directory');
  assert.equal(await e.execute('cat missing || echo recovered'), 'recovered');
  assert.equal(await e.execute('echo one; echo two'), 'one\ntwo');
  assert.equal((await e.execute('echo alpha | grep alpha')).trim(), 'alpha');
  assert.equal((await e.execute('echo alpha | grep beta')).trim(), '');
  assert.equal((await e.execute('echo z | sort')).trim(), 'z');

  assert.equal(await e.execute('touch a && cp a b && mv b c && cat c'), '');
  assert.equal(await e.execute('cat b'), 'cat: b: No such file or directory');

  const found = await e.execute('find /root -name main.c');
  assert.equal(found.trim(), '/root/main.c');
  assert.ok((await e.execute('find /root -name "*.c"')).includes('/root/main.c'));
  assert.ok((await e.execute('find /root -type f')).includes('/root/main.c'));

  const ls = await e.execute('ls -la');
  assert.ok(ls.includes('main.c'));
  assert.ok((await e.execute('ls -l')).includes('-rw-r--r--'));

  assert.equal(await e.execute('rm c && cat c'), 'cat: c: No such file or directory');

  console.log('LinuxLab happy-path engine checks passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
