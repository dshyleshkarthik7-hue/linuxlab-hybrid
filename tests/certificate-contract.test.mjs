import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const edge = await readFile(new URL('../netlify/edge-functions/certificate.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../certificate/index.html', import.meta.url), 'utf8');
const verify = await readFile(new URL('../verify/index.html', import.meta.url), 'utf8');
const verifyJs = await readFile(new URL('../verify/verify.js', import.meta.url), 'utf8');

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

for (const [name, html] of [['certificate', page], ['verify', verify]]) {
  assert.doesNotMatch(html, /<style[\s>]/i, `${name} must not use inline styles`);
  assert.doesNotMatch(html, /<script(?![^>]+\bsrc=)[^>]*>/i, `${name} must not use inline scripts`);
}

assert.match(page, /server-verified/);
assert.match(verify, /PUBLIC VERIFICATION/);
assert.match(verifyJs, /\/api\/certificate/);
console.log('Verified exam and certificate contract checks passed');
