import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const cloudflare = await readFile(new URL('../cloudflare/iso-worker.ts', import.meta.url), 'utf8');
const config = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../artifacts/manifest.json', import.meta.url), 'utf8'));
const tutor = await readFile(new URL('../netlify/edge-functions/tutor.ts', import.meta.url), 'utf8');
const certificate = await readFile(new URL('../netlify/functions/certificate.mts', import.meta.url), 'utf8');
const questionValidation = tutor.indexOf("if (!question) return json({ error: 'Question is required.' }");
const rateLimitCall = tutor.indexOf('const limit = await durableLimit');
assert.ok(questionValidation >= 0 && rateLimitCall > questionValidation, 'Tutor must validate the question before consuming rate-limit quota');
const pinnedModel = 'Qwen/Qwen3-8B@b968826d9c46dd6066d109eabc6255188de91218';
assert.ok(tutor.includes(`const PINNED_QWEN_MODEL = '${pinnedModel}'`), 'Tutor must pin the approved immutable Qwen revision');
assert.ok(certificate.includes(`const PINNED_QWEN_MODEL = '${pinnedModel}'`), 'Certificate feedback must use the same immutable Qwen revision');
assert.match(tutor, /MODEL !== PINNED_QWEN_MODEL/, 'Tutor must fail closed on an environment override mismatch');
assert.match(certificate, /CERTIFICATE_FEEDBACK_MODEL !== PINNED_QWEN_MODEL/, 'Certificate feedback must fail closed on an environment override mismatch');
assert.match(tutor, /return json\(\{ error: 'Tutor provider is temporarily unavailable\./, 'Tutor provider errors must return a non-success response');
assert.match(certificate, /return json\(\{ error: 'AI study feedback is temporarily unavailable\./, 'Certificate feedback provider errors must fail closed');
assert.match(certificate, /certificate_revocations_certificateId_unique|REVOCATION_INDEX_READY/, 'Certificate revocation must use durable indexed storage');

assert.equal(existsSync('netlify/edge-functions/linux4-iso.ts'), false, 'Linux 4 must use the direct Cloudflare Worker rather than a duplicate Netlify relay');
assert.equal(existsSync('netlify/edge-functions/v86-firmware.ts'), true, 'firmware must be served through Netlify Edge');
assert.doesNotMatch(config, /path = "\/api\/iso\/linux4"/);
assert.match(config, /path = "\/api\/v86-firmware"/, 'firmware query endpoint without a trailing slash must be routed to the Edge Function');
assert.match(config, /path = "\/api\/v86-firmware\/\*"/);
const firmwareEdge = await readFile(new URL('../netlify/edge-functions/v86-firmware.ts', import.meta.url), 'utf8');

assert.match(firmwareEdge, /seabios\.bin/);
assert.match(firmwareEdge, /vgabios\.bin/);
assert.match(firmwareEdge, /X-LinuxLab-SHA256/);
assert.match(firmwareEdge, /raw\.githubusercontent\.com\/copy\/v86\/679ecd2e\/bios\/seabios\.bin/, 'SeaBIOS must be fetched from the pinned upstream asset');
assert.match(firmwareEdge, /raw\.githubusercontent\.com\/copy\/v86\/679ecd2e\/bios\/vgabios\.bin/, 'VGABIOS must be fetched from the pinned upstream asset');
assert.doesNotMatch(firmwareEdge, /new URL\("\/" \+ filename, url\.origin\)/, 'firmware must not proxy-fetch from the same site root and recurse');


assert.match(cloudflare, /MAX_CHUNK_BYTES\s*=\s*32\s*\*\s*1024\s*\*\s*1024/);
assert.match(cloudflare, /queryRange/);
assert.match(cloudflare, /Conflicting range parameters/);
assert.match(cloudflare, /contentRange !== expectedContentRange/);
assert.match(cloudflare, /contentLength !== String\(expectedLength\)/);
assert.match(cloudflare, /X-LinuxLab-SHA256/);
assert.match(cloudflare, /X-LinuxLab-Worker-Protocol/);
assert.match(cloudflare, /new AbortController/);
const linux4 = manifest.artifacts.find((artifact) => artifact.image === 'linux4');
assert.ok(linux4, 'linux4 artifact must be present in the manifest');
assert.ok(linux4.fallbackUrls?.some((url) => url.startsWith('https://huggingface.co/buckets/')), 'linux4 must pin a Hugging Face bucket fallback');
assert.ok(linux4.fallbackUrls?.some((url) => url.startsWith('https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/')), 'linux4 must pin a GitHub release fallback');
assert.match(cloudflare, /isNetlifyPreview/);
assert.doesNotMatch(cloudflare, /hostname\.endsWith\('\.netlify\.app'\)/);

assert.match(cloudflare, /crypto\.subtle\.digest\('SHA-256'/);

assert.match(cloudflare, /firmwareKey/);
assert.match(cloudflare, /__cors_origin/);
assert.match(cloudflare, /getFirmware/);

assert.match(cloudflare, /firmwareKey/);
assert.match(cloudflare, /__cors_origin/);
assert.doesNotMatch(cloudflare, /path = .*v86-firmware/);

console.log('Netlify/Cloudflare delivery contract passed');

assert.match(tutor, /const MODEL_ID_RE =/);
assert.match(tutor, /MODEL !== PINNED_QWEN_MODEL/, 'environment overrides must not change the pinned model');
assert.match(tutor, /PINNED_QWEN_MODEL = 'Qwen\/Qwen3-8B@b968826d9c46dd6066d109eabc6255188de91218'/, 'Tutor must use the exact immutable Qwen revision');
assert.match(tutor, /Tutor provider is temporarily unavailable[\s\S]*?503/, 'provider failures must not be disguised as successful 200 responses');
assert.match(tutor, /Tutor provider request failed\. Please try again shortly\./, 'provider exceptions must be visible to callers');

assert.match(firmwareEdge, /crypto\.subtle\.digest\("SHA-256", bytes\)/, 'firmware bytes must be cryptographically verified at the edge');
assert.match(firmwareEdge, /actualHash !== asset\.sha256/, 'firmware delivery must fail closed when the pinned digest differs');
assert.match(firmwareEdge, /bytes\.byteLength !== asset\.size/, 'firmware delivery must verify exact bytes even when upstream omits Content-Length');
