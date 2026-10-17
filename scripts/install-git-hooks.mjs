import { chmod } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const git = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
if (git.status !== 0 || git.stdout.trim() !== root) {
  console.log('[LinuxLab] Skipping Git hook installation outside the repository worktree.');
  process.exit(0);
}
const hook = resolve(root, '.githooks/pre-commit');
await chmod(hook, 0o755);
const configured = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'inherit' });
if (configured.status !== 0) throw new Error('Unable to configure core.hooksPath for LinuxLab quality gates.');
console.log('[LinuxLab] Git pre-commit hook installed (.githooks/pre-commit).');
