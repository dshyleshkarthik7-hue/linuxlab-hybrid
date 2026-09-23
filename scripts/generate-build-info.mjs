import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

function gitCommit() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

const commit = process.env.GITHUB_SHA || process.env.COMMIT_REF || process.env.VERCEL_GIT_COMMIT_SHA || gitCommit();
if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error('Unable to determine deployment commit SHA');
await mkdir('dist', { recursive: true });
await writeFile('dist/build-info.json', JSON.stringify({ commit }, null, 2) + '\n');
console.log('[LinuxLab] build-info.json commit=' + commit);
