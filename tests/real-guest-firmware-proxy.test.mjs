import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./real-guest-alpine.mjs', import.meta.url), 'utf8');
assert.match(source, /u\.pathname\s*===\s*'\/api\/v86-firmware'/, 'real-guest proxy must match the actual firmware endpoint path');
assert.match(source, /u\.searchParams\.get\('firmware'\)/, 'real-guest proxy must select firmware using the query parameter');
assert.match(source, /verifiedFirmware\?\.get\(name\)/, 'real-guest proxy must serve the preverified firmware bytes');
assert.doesNotMatch(source, /const firmwareMatch=.*firmware\(/, 'proxy must not use the stale path-segment matcher or undefined firmware map');
assert.match(source, /x-linuxlab-sha256/, 'proxy must return the firmware digest header');
console.log('Real-guest firmware proxy contract passed');
