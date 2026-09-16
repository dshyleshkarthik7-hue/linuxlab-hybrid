import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const assets = [
  {
    path: 'public/seabios.bin',
    url: 'https://raw.githubusercontent.com/copy/v86/679ecd2e/bios/seabios.bin',
    sha256: '73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98',
    size: 131072,
  },
  {
    path: 'public/vgabios.bin',
    url: 'https://raw.githubusercontent.com/copy/v86/679ecd2e/bios/vgabios.bin',
    sha256: 'a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880',
    size: 36352,
  },
];

for (const asset of assets) {
  const target = resolve(asset.path);
  let bytes;
  try {
    bytes = await readFile(target);
    if (bytes.length !== asset.size) throw new Error('size mismatch');
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== asset.sha256) throw new Error('digest mismatch');
    continue;
  } catch {
    // A missing or unresolved Git LFS pointer is replaced by the pinned upstream
    // v86 firmware during every build. The downloaded bytes are verified before use.
  }

  const response = await fetch(asset.url, { redirect: 'error' });
  if (!response.ok) throw new Error(`Unable to fetch ${asset.url}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length !== asset.size) throw new Error(`${asset.path}: expected ${asset.size} bytes, got ${buffer.length}`);
  const digest = createHash('sha256').update(buffer).digest('hex');
  if (digest !== asset.sha256) throw new Error(`${asset.path}: SHA-256 mismatch (${digest})`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buffer, { mode: 0o644 });
}

console.log('[LinuxLab] Verified pinned v86 SeaBIOS/VGABIOS firmware.');
