import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const cloudflare = await readFile(new URL('../cloudflare/iso-worker.ts', import.meta.url), 'utf8');
const config = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../artifacts/manifest.json', import.meta.url), 'utf8'));
const tutor = await readFile(new URL('../netlify/edge-functions/tutor.ts', import.meta.url), 'utf8');
const questionValidation = tutor.indexOf("if (!question) return json({ error: 'Question is required.' }");
const rateLimitCall = tutor.indexOf('const limit = await durableLimit');
assert.ok(questionValidation >= 0 && rateLimitCall > questionValidation, 'Tutor must validate the question before consuming rate-limit quota');

assert.equal(existsSync('netlify/edge-functions/linux4-iso.ts'), false, 'Linux 4 must use the direct Cloudflare Worker rather than a duplicate Netlify relay');
assert.equal(existsSync('netlify/edge-functions/v86-firmware.ts'), true, 'firmware must be served through Netlify Edge');
assert.doesNotMatch(config, /path = "\/api\/iso\/linux4"/);
assert.match(config, /path = "\/api\/v86-firmware\/\*"/);
const firmwareEdge = await readFile(new URL('../netlify/edge-functions/v86-firmware.ts', import.meta.url), 'utf8');

assert.match(firmwareEdge, /seabios\.bin/);
assert.match(firmwareEdge, /vgabios\.bin/);
assert.match(firmwareEdge, /X-LinuxLab-SHA256/);

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

assert.match(tutor, /Qwen\/Qwen3-8B@b968826d9c46dd6066d109eabc6255188de91218/);
assert.match(tutor, /const MODEL_ID_RE =/);
assert.match(tutor, /PINNED_MODEL = 'Qwen\/Qwen3-8B@b968826d9c46dd6066d109eabc6255188de91218'/, 'Tutor must use only the pinned Qwen3-8B revision shared with certificate study feedback');

assert.match(firmwareEdge, /crypto\.subtle\.digest\("SHA-256", bytes\)/, 'firmware bytes must be cryptographically verified at the edge');
assert.match(firmwareEdge, /actualHash !== asset\.sha256/, 'firmware delivery must fail closed when the pinned digest differs');
assert.match(firmwareEdge, /bytes\.byteLength !== asset\.size/, 'firmware delivery must verify exact bytes even when upstream omits Content-Length');
