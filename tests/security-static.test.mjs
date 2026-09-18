import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const telemetry = await readFile('src/v86-telemetry.ts', 'utf8');
const runtime = await readFile('src/main-v86.ts', 'utf8');
const ready = await readFile('src/v86-ready.ts', 'utf8');
const tutor = await readFile('netlify/edge-functions/tutor.ts', 'utf8');
const certificate = await readFile('netlify/edge-functions/certificate.ts', 'utf8');
const cspReport = await readFile('netlify/edge-functions/csp-report.ts', 'utf8');
const csp = await readFile('netlify.toml', 'utf8');
const integrity = await readFile('src/core/ISOIntegrity.ts', 'utf8');
const artifacts = await readFile('src/core/artifacts.ts', 'utf8');
const quiz = await readFile('quiz/index.html', 'utf8');
const certificatePage = await readFile('certificate/index.html', 'utf8');
const verify = await readFile('verify/index.html', 'utf8');
const beginner = await readFile('beginner/index.html', 'utf8');
const vite = await readFile('vite.config.ts', 'utf8');

assert.equal(/window\.V86\s*=/.test(telemetry), false);
assert.equal(/(?:\:\s*any\b|\bas\s+any\b|<\s*any\s*>)/.test(telemetry), false);
assert.equal(/serial0_send/.test(telemetry), false);
assert.match(runtime, /attachGuestTelemetry\s*\(\s*vm/);
assert.match(runtime, /markReadyIfIdentityVerified\s*\(/);
assert.match(runtime, /autostart:\s*false/);
assert.match(runtime, /waitForV86Loaded/);
assert.match(runtime, /wait_until_vga_screen_contains/);
assert.match(ready, /AbortSignal/);
assert.match(ready, /remove_listener/);
assert.equal(/request\.headers\.get\(['"]x-forwarded-for['"]\)/.test(tutor), false);
assert.equal(/request\.headers\.get\(['"]x-forwarded-for['"]\)/.test(cspReport), false);
assert.match(cspReport, /function clientKey\(context:\s*EdgeContext\)/);
assert.match(cspReport, /type EdgeContext\s*=\s*\{\s*ip\?:\s*string\s*\}/);
assert.match(cspReport, /export default async \(request:\s*Request,\s*context:\s*EdgeContext\)/);
assert.match(cspReport, /rateLimited\(context\)/);
assert.match(tutor, /UPSTASH_REDIS_REST_URL/);
assert.match(tutor, /UPSTASH_REDIS_REST_TOKEN/);
assert.match(tutor, /MAX_QUESTION_CHARS/);
assert.match(certificate, /CERTIFICATE_SIGNING_SECRET/);
assert.match(certificate, /HMAC/);
assert.match(certificate, /QUESTION_COUNT\s*=\s*30/);
assert.match(certificate, /PASS_PERCENT\s*=\s*80/);
assert.match(artifacts, /size:\s*691011584/);
assert.match(artifacts, /size:\s*51380224/);
assert.match(artifacts, /size:\s*7731200/);
assert.match(integrity, /sha256StreamHex/);
assert.match(integrity, /new Sha256\(\)/);
assert.equal(/crypto\.subtle\.digest/.test(integrity), false);
assert.match(integrity, /response\.body\.getReader\(\)/);
assert.equal(csp.includes('https://router.huggingface.co'), false);
for (const [name, html] of [['quiz', quiz], ['certificate', certificatePage], ['verify', verify]]) {
  assert.doesNotMatch(html, /<style[\s>]/i, `${name} inline styles`);
  assert.doesNotMatch(html, /<script(?![^>]+\bsrc=)[^>]*>/i, `${name} inline scripts`);
}
assert.match(beginner, /200 Linux Commands/);
assert.match(vite, /login:\s*entry\('login\/index.html'\)/);

console.log('Static and runtime-facing security guardrails passed');
