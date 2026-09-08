#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const work = process.env.LINUXLAB_ISO_WORK || './.linuxlab-iso-work';
const output = process.env.LINUXLAB_ISO_OUTPUT || './iso-builder/output';

const isWindows = process.platform === 'win32';
const command = isWindows ? 'powershell.exe' : 'bash';
const args = isWindows
  ? ['-ExecutionPolicy', 'Bypass', '-File', './iso-builder/build-alpine-gcc.ps1']
  : ['./iso-builder/build-linuxlab-gcc.sh', work, output];

const result = spawnSync(command, args, { stdio: 'inherit' });

if (result.error) {
  const hint = isWindows
    ? 'PowerShell was not available. Run the ISO build from PowerShell or WSL.'
    : 'bash was not available. Run the ISO build on Linux, macOS, or WSL.';
  console.error(`[LinuxLab] ${hint}`);
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
