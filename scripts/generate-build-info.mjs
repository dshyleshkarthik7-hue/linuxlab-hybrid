import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

function gitCommit() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

const candidates = [process.env.GITHUB_SHA, process.env.COMMIT_REF, process.env.VERCEL_GIT_COMMIT_SHA, gitCommit()];
const commit = candidates.find(value => typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value)) || null;
const packageJson = await readFile('package.json');
const artifactManifest = await readFile('artifacts/manifest.json');
const fingerprint = createHash('sha256').update(packageJson).update(artifactManifest).digest('hex');
await mkdir('dist', { recursive: true });
await writeFile('dist/build-info.json', JSON.stringify({ commit, source: commit ? 'git' : 'archive', fingerprint }, null, 2) + '\n');
console.log('[LinuxLab] build-info.json source=' + (commit ? 'git commit ' + commit : 'archive fingerprint ' + fingerprint));
