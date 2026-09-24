import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const iso = await readFile(new URL('../netlify/edge-functions/linux4-iso.ts', import.meta.url), 'utf8');
const firmware = await readFile(new URL('../netlify/edge-functions/v86-firmware.ts', import.meta.url), 'utf8');
const config = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');

assert.match(config, /path = "\/api\/iso\/linux4"/);
assert.match(config, /function = "linux4-iso"/);
assert.match(config, /path = "\/api\/v86-firmware\/\*"/);
assert.match(config, /function = "v86-firmware"/);
assert.doesNotMatch(config, /from = "\/api\/v86-firmware\/(?:seabios|vgabios)\.bin"\s*\n\s*to = "\/api\/v86-firmware\/(?:seabios|vgabios)\.bin"/);

assert.match(iso, /MAX_CHUNK_BYTES\s*=\s*48\s*\*\s*1024\s*\*\s*1024/);
assert.match(iso, /queryRange/);
assert.match(iso, /Conflicting range parameters/);
assert.match(iso, /contentRange !== expectedContentRange/);
assert.match(iso, /contentLength !== String\(expectedLength\)/);
assert.match(iso, /X-LinuxLab-SHA256/);
assert.match(iso, /X-LinuxLab-Worker-Protocol/);
assert.match(iso, /new AbortController/);
assert.match(iso, /huggingface\.co\/buckets/);
assert.match(iso, /github\.com\/dshyleshkarthik7-hue\/linuxlab-hybrid\/releases\/download/);
assert.match(iso, /allowedPreview/);
assert.doesNotMatch(iso, /hostname\.endsWith\('\.netlify\.app'\)/);

assert.match(firmware, /SEABIOS_ARTIFACT/);
assert.match(firmware, /VGABIOS_ARTIFACT/);
assert.match(firmware, /UPSTREAM_TIMEOUT_MS\s*=\s*30_000/);
assert.match(firmware, /SHA-256/);
assert.match(firmware, /Content-Length/);

console.log('Netlify Edge production contract passed');
