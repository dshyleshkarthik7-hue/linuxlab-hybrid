import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('src/main-v86.ts', 'utf8');
assert.match(source, /private readonly handlePageHide = \(\): void => \{/,
  'VM must define a pagehide cleanup handler');
assert.match(source, /const disposeTelemetry = this\.telemetryDispose/, 'Telemetry disposer must be detached before invocation');
assert.match(source, /try \{ disposeTelemetry\?\.\(\); \} catch/, 'Telemetry cleanup failures must not skip VM teardown');
assert.match(source, /try \{ emulator\?\.destroy\?\.\(\); \} catch/, 'VM destroy failures must not skip reference release');
assert.match(source, /this\.bootController\?\.abort\(\)/,
  'Leaving the page must abort in-flight VM startup');
assert.match(source, /this\.bootId \+= 1/,
  'Leaving the page must invalidate stale boot callbacks');
assert.match(source, /void this\.dispose\(\)\.finally\(\(\) => this\.term\.dispose\(\)\)/,
  'Leaving the page must stop and destroy the VM and dispose the terminal');
assert.match(source, /window\.addEventListener\('pagehide', this\.handlePageHide, \{ once: true \}\)/,
  'The cleanup handler must be registered once');
assert.match(source, /if \(window\.linuxLabVM === this\) delete window\.linuxLabVM/,
  'The global VM reference must be released');
console.log('VM pagehide lifecycle contract passed');
