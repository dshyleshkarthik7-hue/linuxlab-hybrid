import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const dir = await mkdtemp(join(tmpdir(), 'linuxlab-v8-'));
const env = { ...process.env, NODE_V8_COVERAGE: dir };
const child = spawn(process.execPath, ['--experimental-strip-types', 'tests/coverage-runner.ts'], { env, stdio: 'inherit' });
const exit = await new Promise(resolve => child.on('exit', code => resolve(code ?? 1)));
if (exit !== 0) process.exit(exit);

const files = (await import('node:fs/promises')).readdir(dir).then(async names => Promise.all(names.filter(n => n.endsWith('.json')).map(async n => JSON.parse(await readFile(join(dir, n), 'utf8')))));
const reports = await files;
let total = 0, covered = 0;
for (const report of reports) {
  for (const entry of report.result ?? []) {
    if (!/\/src\//.test(entry.url) || !entry.functions) continue;
    for (const fn of entry.functions) {
      total++;
      if ((fn.ranges?.[0]?.count ?? 0) > 0) covered++;
    }
  }
}
const percentage = total ? covered / total * 100 : 0;
console.log(`V8 source function coverage: ${covered}/${total} (${percentage.toFixed(1)}%)`);
if (total === 0 || percentage < 50) throw new Error(`Coverage threshold failed: require at least 50% source function coverage, got ${percentage.toFixed(1)}%`);
await rm(dir, { recursive: true, force: true });
