import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const assets = [
  {
    path: 'public/seabios.bin',
    urls: [
      'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v86-firmware-1/seabios.bin',
      'https://raw.githubusercontent.com/copy/v86/679ecd2e/bios/seabios.bin',
    ],
    sha256: '73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98',
    size: 131072,
  },
  {
    path: 'public/vgabios.bin',
    urls: [
      'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v86-firmware-1/vgabios.bin',
      'https://raw.githubusercontent.com/copy/v86/679ecd2e/bios/vgabios.bin',
    ],
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

  let buffer;
  const failures = [];
  for (const url of asset.urls) {
    let response;
    try {
      // GitHub release assets redirect to an asset host; follow redirects, then
      // authenticate the bytes with the pinned size and SHA-256 before writing.
      response = await fetch(url, { redirect: 'follow' });
    } catch (error) {
      failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (!response.ok) {
      failures.push(`${url}: HTTP ${response.status}`);
      continue;
    }
    buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length !== asset.size) {
      throw new Error(`${asset.path}: ${url} returned ${buffer.length} bytes; expected ${asset.size}`);
    }
    const digest = createHash('sha256').update(buffer).digest('hex');
    if (digest !== asset.sha256) {
      throw new Error(`${asset.path}: SHA-256 mismatch for ${url} (${digest})`);
    }
    break;
  }
  if (!buffer) throw new Error(`Unable to fetch verified ${asset.path} from any source:\\n${failures.join('\\n')}`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buffer, { mode: 0o644 });
}

console.log('[LinuxLab] Verified pinned v86 SeaBIOS/VGABIOS firmware.');
