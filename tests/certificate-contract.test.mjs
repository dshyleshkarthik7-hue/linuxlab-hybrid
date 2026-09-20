import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const certificate = await readFile(new URL('../netlify/functions/certificate.mts', import.meta.url), 'utf8');
const netlify = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
const page = await readFile(new URL('../certificate/index.html', import.meta.url), 'utf8');
const certJs = await readFile(new URL('../certificate/certificate.js', import.meta.url), 'utf8');
const verify = await readFile(new URL('../verify/index.html', import.meta.url), 'utf8');
const verifyJs = await readFile(new URL('../verify/verify.js', import.meta.url), 'utf8');
const loginJs = await readFile(new URL('../src/login.ts', import.meta.url), 'utf8');
const progressJs = await readFile(new URL('../public/progress.js', import.meta.url), 'utf8');

assert.match(certificate, /UPSTASH_REDIS_REST_URL/);
assert.match(certificate, /UPSTASH_REDIS_REST_TOKEN/);
assert.match(certificate, /CERTIFICATE_SIGNING_SECRET/);
assert.match(certificate, /HMAC/);
assert.match(certificate, /QUESTION_COUNT\s*=\s*30/);
assert.match(certificate, /PASS_PERCENT\s*=\s*80/);
assert.match(certificate, /canonical\(unsigned/);
assert.match(certificate, /new TextEncoder\(\)\.encode\(secret\)/, 'certificate signing must use the selected key, not only the current key');
assert.match(certificate, /constantTimeEqualHex\(expected, signature\)/, 'certificate verification must compare signatures without ordinary string equality');
assert.match(certificate, /userId/);
assert.match(certificate, /DEL/);
assert.doesNotMatch(certificate, /(?:\:\s*any\b|\bas\s+any\b|<\s*any\s*>)/);

assert.match(certificate, /rateLimit\(/, 'certificate API must retain Redis-backed rate limiting');
assert.match(certificate, /INCR/);
assert.match(certificate, /EXPIRE/);
assert.match(certificate, /MongoClient/);
assert.match(certificate, /certificatesCollection/);
assert.match(certificate, /updateOne\(/);
assert.match(certificate, /findOne\(/);
assert.match(certificate, /export const config = \{ path: ['\"]\/api\/certificate['\"] \}/);
assert.doesNotMatch(netlify, /function = "certificate"/);

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
console.log('Verified production certificate, MongoDB persistence, auth-return, progress, and security contracts passed');
