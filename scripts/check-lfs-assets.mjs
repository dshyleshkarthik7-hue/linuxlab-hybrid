import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Verify web runtime firmware for normal site builds. ISO boot-sector binaries are
// only required by the ISO image builder, so check those only with --iso.
const assets = [
  { path: 'public/seabios.bin', size: 131072, sha256: '73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98' },
  { path: 'public/vgabios.bin', size: 36352, sha256: 'a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880' },
];
if (process.argv.includes('--iso')) assets.push(
  { path: 'isolinux/isolinux.bin', size: 38912, sha256: 'f0f645e52bbe18bf7a4ac07be9afa985e21d8eb8c9c57938bdaf5b868a0e0e7f' },
  { path: 'isolinux/isohdpfx.bin', size: 432, sha256: '7b43a4dd2061e95da55af51d57a2385c257d64444ee2a62264bcf634a1d0945b' },
);

let failed = false;
for (const asset of assets) {
  let bytes;
  try { bytes = await readFile(asset.path); }
  catch (error) { console.error('[LinuxLab][LFS] Missing asset:', asset.path, error.message); failed = true; continue; }
  if (bytes.toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1')) {
    console.error('[LinuxLab][LFS] Unhydrated Git LFS pointer:', asset.path, '— use a Git LFS checkout and pull the LFS objects.');
    failed = true; continue;
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== asset.size || digest !== asset.sha256) {
    console.error('[LinuxLab][LFS] Asset integrity failure:', asset.path, 'expected', asset.size, 'bytes /', asset.sha256, 'received', bytes.length, 'bytes /', digest);
    failed = true; continue;
  }
  console.log('[LinuxLab][LFS] Verified', asset.path, '(' + bytes.length + ' bytes)');
}
if (failed) process.exitCode = 1;
else console.log('[LinuxLab][LFS] All release firmware assets are hydrated and match their pinned SHA-256 digests.');
