import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const telemetry = await readFile('src/v86-telemetry.ts', 'utf8');
const runtime = await readFile('src/main-v86.ts', 'utf8');
const tutor = await readFile('netlify/edge-functions/tutor.ts', 'utf8');

assert.equal(/window\.V86\s*=/.test(telemetry), false, 'telemetry must not monkey-patch window.V86');
assert.equal(/(?:\:\s*any\b|\bas\s+any\b|<\s*any\s*>)/.test(telemetry), false, 'telemetry must not use any type');
assert.equal(/window\.(?:guest|alpine|release|identity)/i.test(telemetry), false, 'guest identity must not be exposed globally');
assert.equal(/serial0_send/.test(telemetry), false, 'telemetry must not write to the guest serial port');
assert.match(runtime, /attachGuestTelemetry\s*\(\s*vm/);
assert.match(runtime, /telemetryDispose\?\.\(\)/);
assert.equal(/request\.headers\.get\(['"]x-forwarded-for['"]\)/.test(tutor), false, 'Tutor must not trust client-supplied forwarding headers');
assert.equal(/(?:\:\s*any\b|\bas\s+any\b|<\s*any\s*>)/.test(tutor), false, 'Tutor must not use any type');
assert.match(tutor, /AbortController/);
assert.match(tutor, /MAX_QUESTION_CHARS/);
assert.match(tutor, /MAX_CONTEXT_CHARS/);
assert.match(tutor, /rateLimit/);
assert.match(tutor, /aggregateBy:\s*\[['"]ip['"],\s*['"]domain['"]\]/);
assert.equal(/new Map<.*buckets|buckets\s*=\s*new Map/.test(tutor), false, 'Tutor rate limiting must not depend on per-runtime memory');
console.log('Static security guardrails passed');
