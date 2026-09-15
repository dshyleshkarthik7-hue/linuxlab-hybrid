#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const builder = await readFile(new URL('./build-linuxlab-gcc.sh', import.meta.url), 'utf8');

const forbiddenMountPatterns = [
  /mount\s+--rbind\s+\/sys\b/,
  /mount\s+--rbind\s+\/dev\b/,
  /mount\s+--rbind\s+\/run\b/,
  /mount\s+-t\s+proc\s+proc\s+/,
];

for (const pattern of forbiddenMountPatterns) {
  if (pattern.test(builder)) {
    throw new Error(`Unsafe host mount remains in ISO builder: ${pattern}`);
  }
}

if (!/sha256sum|sha256/i.test(builder)) {
  throw new Error('ISO builder must contain an explicit SHA-256 verification step.');
}

if (!/failed SHA-256|checksum|digest/i.test(builder)) {
  throw new Error('ISO builder must fail closed on digest mismatch.');
}

console.log('ISO build safety policy checks passed.');
