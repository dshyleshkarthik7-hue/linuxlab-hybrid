import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../artifacts/manifest.json', import.meta.url), 'utf8'));
const runtimeAssets = manifest.artifacts
  .filter((artifact) => artifact.filename === 'seabios.bin' || artifact.filename === 'vgabios.bin')
  .map((artifact) => ({ path: 'public/' + artifact.filename, size: artifact.size, sha256: artifact.sha256 }));
const isoAssets = (manifest.buildAssets || []).map(({ path, size, sha256 }) => ({ path, size, sha256 }));
const assets = process.argv.includes('--iso') ? [...runtimeAssets, ...isoAssets] : runtimeAssets;

if (runtimeAssets.length !== 2) throw new Error('Artifact manifest must pin both v86 runtime firmware assets');
if (process.argv.includes('--iso') && isoAssets.length < 2) throw new Error('Artifact manifest must pin ISO boot assets before building an ISO');

let failed = false;
for (const asset of assets) {
  let bytes;
  try { bytes = await readFile(asset.path); }
  catch (error) { console.error('[LinuxTerminal][LFS] Missing asset:', asset.path, error.message); failed = true; continue; }
  if (bytes.toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1')) {
    console.error('[LinuxTerminal][LFS] Unhydrated Git LFS pointer:', asset.path, '— hydrate Git LFS objects before building.');
    failed = true; continue;
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== asset.size || digest !== asset.sha256) {
    console.error('[LinuxTerminal][LFS] Asset integrity failure:', asset.path, 'expected', asset.size, 'bytes /', asset.sha256, 'received', bytes.length, 'bytes /', digest);
    failed = true; continue;
  }
  console.log('[LinuxTerminal][LFS] Verified', asset.path, '(' + bytes.length + ' bytes)');
}
if (failed) process.exitCode = 1;
else console.log('[LinuxTerminal][LFS] All required firmware and ISO boot assets are hydrated and match the manifest SHA-256 digests.');
