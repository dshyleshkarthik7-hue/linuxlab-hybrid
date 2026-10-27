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
const routerModel = 'Qwen/Qwen3-8B';
assert.ok(tutor.includes(`const ROUTER_QWEN_MODEL = '${routerModel}'`), 'Tutor must pin the supported Hugging Face router model ID');
assert.ok(certificate.includes(`const ROUTER_QWEN_MODEL = '${routerModel}'`), 'Certificate feedback must use the same supported Hugging Face router model ID');
assert.match(tutor, /MODEL !== ROUTER_QWEN_MODEL/, 'Tutor must fail closed on an environment override mismatch');
assert.match(certificate, /CERTIFICATE_FEEDBACK_MODEL !== ROUTER_QWEN_MODEL/, 'Certificate feedback must fail closed on an environment override mismatch');
assert.match(tutor, /return json\(\{ error: 'Tutor provider is temporarily unavailable\./, 'Tutor provider errors must return a non-success response');
assert.match(certificate, /return json\(\{ error: 'AI study feedback is temporarily unavailable\./, 'Certificate feedback provider errors must fail closed');
assert.match(certificate, /certificate_revocations_certificateId_unique|revocationIndexPromise/, 'Certificate revocation must use durable indexed storage');

assert.equal(existsSync('netlify/edge-functions/linux4-iso.ts'), true, 'Linux 4 must be served by Netlify Edge (not Cloudflare Worker)');
assert.equal(existsSync('netlify/edge-functions/v86-firmware.ts'), false, 'firmware stays as Netlify static /seabios.bin and /vgabios.bin (no runtime proxy)');
assert.match(config, /linux4-iso/, 'netlify.toml must register the linux4-iso edge function');
assert.doesNotMatch(config, /v86-firmware/, 'firmware API routes must remain removed; static Netlify assets are used');
const linux4Entry = await readFile(new URL('../src/main-linux4.ts', import.meta.url), 'utf8');
const v86Entry = await readFile(new URL('../src/main-v86.ts', import.meta.url), 'utf8');
const firmwareBuild = await readFile(new URL('../scripts/fetch-v86-firmware.mjs', import.meta.url), 'utf8');
const headersBuild = await readFile(new URL('../scripts/generate-netlify-headers.mjs', import.meta.url), 'utf8');
assert.match(linux4Entry, /bios: \{ url: '\/seabios\.bin' \}/);
assert.match(linux4Entry, /vga_bios: \{ url: '\/vgabios\.bin' \}/);
assert.ok(v86Entry.includes("fetch('/seabios.bin'") && v86Entry.includes("fetch('/vgabios.bin'"), 'v86 must load firmware from root-level static assets');
assert.match(firmwareBuild, /createHash\('sha256'\)/);
assert.match(headersBuild, /max-age=31536000, immutable/);

assert.match(cloudflare, /MAX_CHUNK_BYTES\s*=\s*32\s*\*\s*1024\s*\*\s*1024/);
assert.match(cloudflare, /queryRange/);
assert.match(cloudflare, /Conflicting range parameters/);
assert.match(cloudflare, /content-range"\) !== expectedContentRange/);
assert.match(cloudflare, /content-length"\) !== String\(expectedLength\)/);
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
assert.doesNotMatch(cloudflare, /path = .*v86-firmware/);

const linux4Edge = await readFile(new URL('../netlify/edge-functions/linux4-iso.ts', import.meta.url), 'utf8');
assert.match(linux4Edge, /linux4/, 'linux4 edge must reference the pinned artifact');
assert.match(linux4Edge, /chunkStart/, 'linux4 edge must support chunkStart/chunkEnd');
assert.match(linux4Edge, /x-linuxlab-delivery/, 'linux4 edge must mark Netlify delivery');
assert.match(linux4Edge, /async function verifyFullArtifact\(bytes: Uint8Array\)/, 'full-file requests must validate the complete artifact');
assert.match(linux4Edge, /crypto\.subtle\.digest\('SHA-256', digestInput\.buffer\)/, 'full-file responses must verify the pinned digest using a typed-array-safe buffer');
assert.match(linux4Edge, /const responseStatus = range \? 206 : 200/, 'ordinary full-file requests must return 200 while explicit ranges return 206');
assert.match(linux4Edge, /if \(range\) headers\.set\('content-range', expectedContentRange\)/, 'Content-Range must only be sent for explicit range requests');
assert.match(linux4Edge, /const rangeBytes = new Uint8Array\(await response\.arrayBuffer\(\)\)/, 'upstream range bodies must be consumed and checked before being returned');
assert.match(linux4Edge, /rangeBytes\.byteLength !== length/, 'truncated upstream range bodies must fail before delivery');

assert.match(linux4Entry, /const ISO_URL = '\/api\/linux4-iso'/, 'Linux 4 boot must fetch ISO from Netlify Edge');
assert.doesNotMatch(linux4Entry, /workers\.dev\/\?image=linux4/, 'Linux 4 must not use the Cloudflare Worker primary URL');

console.log('Netlify/Cloudflare delivery contract passed');

assert.match(tutor, /const MODEL_ID_RE =/);
assert.match(tutor, /MODEL !== ROUTER_QWEN_MODEL/, 'environment overrides must not change the configured router model ID');
assert.ok(tutor.includes("ROUTER_QWEN_MODEL = 'Qwen/Qwen3-8B'"), 'Tutor must use the standard Hugging Face router model ID');
assert.match(tutor, /Tutor provider is temporarily unavailable[\s\S]*?503/, 'provider failures must not be disguised as successful 200 responses');
assert.match(tutor, /Tutor provider request failed\. Please try again shortly\./, 'provider exceptions must be visible to callers');

assert.match(firmwareBuild, /asset\.size/);
assert.match(firmwareBuild, /asset\.sha256/);
