import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const telemetry = await readFile('src/v86-telemetry.ts', 'utf8');
const runtime = await readFile('src/main-v86.ts', 'utf8');

assert.equal(/window\.V86\s*=/.test(telemetry), false, 'telemetry must not monkey-patch window.V86');
assert.equal(/\bany\b/.test(telemetry), false, 'telemetry must not use any');
assert.equal(/window\.(?:guest|alpine|release|identity)/i.test(telemetry), false, 'guest identity must not be exposed globally');
assert.match(runtime, /attachGuestTelemetry\(vm/);
assert.match(runtime, /telemetryDispose\?\.\(\)/);
console.log('Static security guardrails passed');
