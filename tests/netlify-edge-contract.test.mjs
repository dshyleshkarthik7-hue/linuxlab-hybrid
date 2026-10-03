import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const cloudflare = await readFile(new URL('../cloudflare/iso-worker.ts', import.meta.url), 'utf8');
const config = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../artifacts/manifest.json', import.meta.url), 'utf8'));

assert.equal(existsSync('netlify/edge-functions/linux4-iso.ts'), false, 'duplicate Netlify ISO worker must not be present');
assert.doesNotMatch(config, /path = "\/api\/iso\/linux4"/);

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

assert.doesNotMatch(config, /api\/v86-firmware/);
assert.match(cloudflare, /firmware/);
assert.match(cloudflare, /X-LinuxLab-Artifact-Size/);
assert.match(cloudflare, /crypto\.subtle\.digest\('SHA-256'/);



assert.doesNotMatch(config, /api\/v86-firmware/);
assert.match(cloudflare, /firmware/);
assert.match(cloudflare, /X-LinuxLab-Artifact-Size/);
assert.match(cloudflare, /crypto\\.subtle\\.digest\\('SHA-256'/);
assert.match(cloudflare, /firmwareKey/);
assert.match(cloudflare, /__cors_origin/);
assert.doesNotMatch(cloudflare, /v86-firmware/);

console.log('Netlify/Cloudflare delivery contract passed');
