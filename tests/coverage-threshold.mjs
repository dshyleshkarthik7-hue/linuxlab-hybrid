import { spawn } from 'node:child_process';

const args = [
  '--test',
  '--experimental-strip-types',
  '--experimental-test-coverage',
  '--test-coverage-include=src/**/*.ts',
  '--test-coverage-exclude=src/**/*.d.ts',
  '--test-coverage-functions=75',
  '--test-coverage-lines=75',
  '--test-coverage-branches=60',
  'tests/coverage-runner.ts',
];

const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
