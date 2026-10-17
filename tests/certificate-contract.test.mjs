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
assert.match(certificate, /CERTIFICATE_SIGNING_KEYS/);
assert.match(certificate, /CERTIFICATE_SIGNING_KEY_ID/);
assert.doesNotMatch(certificate, /CERTIFICATE_SIGNING_SECRET/, 'legacy signing secret must not remain in certificate runtime or tests');
assert.match(certificate, /HMAC/);
assert.match(certificate, /QUESTION_COUNT\s*=\s*30/);
assert.match(certificate, /MIN_QUESTION_BANK_SIZE\s*=\s*100/);
assert.match(certificate, /buildQuestionBank\(\)/);
assert.match(certificate, /const bank = \[\.\.\.COMMON_BANK, \.\.\.FUNDAMENTAL_BANK\]/, 'verified assessment must use curated Linux foundations questions only');
assert.doesNotMatch(certificate, /COMMAND_RECORDS|cmd-\$\{index\}-purpose|cmd-\$\{index\}-category|cmd-\$\{index\}-example/, 'catalog-trivia generation must not be used in the certificate exam');
assert.match(certificate, /Curated exam question has invalid answer choices/, 'verified exam must reject duplicate answer choices');
assert.match(certificate, /question\.c\.length !== 4 \|\| new Set\(question\.c\)\.size !== 4/, 'verified exam must reject duplicate answer choices');
assert.match(certificate, /EXAM_VERSION = 'linux-foundations-2\.3'/, 'exam version must change when question generation changes');
assert.match(certificate, /bank\.length < MIN_QUESTION_BANK_SIZE/);
assert.match(certificate, /const selected = shuffle\(bank\)/, 'exam question selection should be randomized for every attempt');
assert.match(certificate, /Curated exam question leaks its answer in the question text/, 'exam generation must reject answer leaks');
assert.match(certificate, /PASS_PERCENT\s*=\s*80/);
assert.match(certificate, /canonical\(unsigned/);
assert.match(certificate, /new TextEncoder\(\)\.encode\(secret\)/, 'certificate signing must use the selected key, not only the current key');
assert.match(certificate, /constantTimeEqualHex\(expected, signature\)/, 'certificate verification must compare signatures without ordinary string equality');
assert.match(certificate, /typeof left !== 'string'.*typeof right !== 'string'/, 'malformed stored signatures must fail closed instead of throwing');
assert.match(certificate, /userId/);
assert.match(certificate, /DEL/);
assert.doesNotMatch(certificate, /(?:\:\s*any\b|\bas\s+any\b|<\s*any\s*>)/);

assert.match(certificate, /rateLimit\(/, 'certificate API must retain Redis-backed rate limiting');
assert.match(certificate, /CERTIFICATE_ALLOWED_ORIGINS/, 'certificate CORS must use a dedicated allowlist');
assert.match(certificate, /createIndex\(\{ expiresAt: 1 \}/, 'certificate persistence must create an expiry index');
assert.match(certificate, /expiresAt,/, 'issued certificates must receive an explicit expiry');
assert.match(certificate, /questionIds\.has\(answer\.id\)/, 'submissions must bind answers to the server-issued question set');
assert.match(certificate, /choice < 0/, 'submissions must reject negative answer indexes');
assert.match(certificate, /choice >= 4/, 'submissions must reject out-of-range answer indexes');
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

assert.match(certificate, /const id = await stableCertificateId\(value\.attemptId\)/, 'certificate IDs must be deterministic per submitted attempt for idempotent issuance');
assert.match(certificate, /cache-control.*no-store/i);

assert.match(certificate, /REVOKED_CERTIFICATE_IDS/);
assert.match(certificate, /certificate_revocations/);
assert.match(certificate, /certificateId: 1/);
assert.match(certificate, /certificateIsDurablyRevoked/);
assert.match(certificate, /rate:exam-start:ip/);
assert.match(certificate, /rate:exam-submit:ip/);

assert.match(certificate, /ROUTER_QWEN_MODEL = 'Qwen\\/Qwen3-8B'/, 'certificate feedback must use a standard Hugging Face router model ID');
const tutorSource = await readFile(new URL('../netlify/edge-functions/tutor.ts', import.meta.url), 'utf8');
assert.match(tutorSource, /ROUTER_QWEN_MODEL = 'Qwen\\/Qwen3-8B'/, 'Tutor must use a standard Hugging Face router model ID');
assert.match(certificate, /async function explainStudyPlan/);
assert.match(certificate, /rate:certificate-feedback:user/);
assert.match(certificate, /studyTopics/);
assert.match(certJs, /Get AI study plan/);
