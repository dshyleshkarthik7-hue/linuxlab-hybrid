import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/main-v86.ts', import.meta.url), 'utf8');
const linux4 = await readFile(new URL('../src/main-linux4.ts', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/fetch-v86-firmware.mjs', import.meta.url), 'utf8');
assert.match(source, /FIRMWARE_BASE|fetch\(/);
assert.match(source, /artifact\.filename/);
assert.match(linux4, /bios: \{ url: '\/seabios\.bin' \}/);
assert.match(linux4, /vga_bios: \{ url: '\/vgabios\.bin' \}/);
assert.doesNotMatch(source + linux4, /api\/v86-firmware/, 'browser VM must not call a runtime firmware proxy');
assert.match(build, /createHash\('sha256'\)/, 'build must verify pinned firmware hashes');
console.log('Static firmware delivery contract passed');
