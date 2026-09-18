import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const edge = await readFile(new URL('../netlify/edge-functions/certificate.ts', import.meta.url), 'utf8');
const limiter = await readFile(new URL('../netlify/edge-functions/certificate-rate-limit.ts', import.meta.url), 'utf8');
const netlify = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
const page = await readFile(new URL('../certificate/index.html', import.meta.url), 'utf8');
const certJs = await readFile(new URL('../certificate/certificate.js', import.meta.url), 'utf8');
const verify = await readFile(new URL('../verify/index.html', import.meta.url), 'utf8');
const verifyJs = await readFile(new URL('../verify/verify.js', import.meta.url), 'utf8');
const loginJs = await readFile(new URL('../src/login.ts', import.meta.url), 'utf8');
const progressJs = await readFile(new URL('../public/progress.js', import.meta.url), 'utf8');

assert.match(edge, /UPSTASH_REDIS_REST_URL/);
assert.match(edge, /UPSTASH_REDIS_REST_TOKEN/);
assert.match(edge, /CERTIFICATE_SIGNING_SECRET/);
assert.match(edge, /HMAC/);
assert.match(edge, /QUESTION_COUNT\s*=\s*30/);
assert.match(edge, /PASS_PERCENT\s*=\s*80/);
assert.match(edge, /canonical\(unsigned\)/);
assert.match(edge, /userId/);
assert.match(edge, /DEL/);
assert.doesNotMatch(edge, /(?:\:\s*any\b|\bas\s+any\b|<\s*any\s*>)/);

assert.match(limiter, /LIMIT\s*=\s*60/);
assert.match(limiter, /WINDOW_SECONDS\s*=\s*60/);
assert.match(limiter, /INCR/);
assert.match(limiter, /EXPIRE/);
assert.match(limiter, /429/);
assert.match(limiter, /certificate\(request\)/);
assert.match(netlify, /function = "certificate-rate-limit"/);
assert.doesNotMatch(netlify, /function = "certificate"\s*\n/);

for (const [name, html] of [['certificate', page], ['verify', verify]]) {
  assert.doesNotMatch(html, /<style[\s>]/i, `${name} must not use inline styles`);
  assert.doesNotMatch(html, /<script(?![^>]+\bsrc=)[^>]*>/i, `${name} must not use inline scripts`);
}

assert.match(page, /server-verified/);
assert.match(page, /id="signup"/);
assert.match(page, /id="start"/);
assert.match(certJs, /returnTo=%2Fcertificate%2F/);
assert.match(certJs, /post\('start'\)/);
assert.match(certJs, /post\('submit'/);
assert.match(loginJs, /identity\.on\('init'/);
assert.match(loginJs, /currentUser\(\)/);
assert.match(loginJs, /location\.replace\(returnTo\)/);
assert.match(loginJs, /Already signed in\. Returning/);
assert.match(progressJs, /(?:Exact score|Final score)/);
assert.match(progressJs, /recordQuiz\(\s*Number\(\s*(?:m|match)\[1\]\s*\),\s*Number\(\s*(?:m|match)\[2\]\s*\)\s*\)/);
assert.match(verify, /PUBLIC VERIFICATION/);
assert.match(verifyJs, /\/api\/certificate/);
console.log('Verified exam, auth-return, progress, and certificate rate-limit contracts passed');
