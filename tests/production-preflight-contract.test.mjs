import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('../scripts/production-preflight.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.match(script, /ROUTER_QWEN_MODEL = process\.env\.HF_MODEL\?\.trim\(\) \|\| 'Qwen\/Qwen3-8B'/, 'Production preflight must default to the pinned Hugging Face router model while allowing the validated environment override');
assert.match(script, /Qwen\\\/Qwen3-8B:\[a-z0-9_-\]\+\$/, 'Production preflight must validate an optional Hugging Face provider suffix');
assert.match(script, /router\.huggingface\.co\/v1\/chat\/completions/);
assert.match(script, /certificates_expiresAt_ttl/);
assert.match(script, /certificate_revocations_certificateId_unique/);
assert.match(script, /CERTIFICATE_SIGNING_KEY_ID/);
assert.match(script, /UPSTASH_REDIS_REST_URL/);
assert.match(script, /process\.env\.HF_TOKEN/);
assert.match(script, /No secret values were printed/);
assert.equal(pkg.scripts['release:preflight'], 'node scripts/production-preflight.mjs');
console.log('Production preflight contract passed');
