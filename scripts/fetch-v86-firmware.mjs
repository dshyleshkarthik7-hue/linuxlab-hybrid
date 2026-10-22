import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
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

const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));

async function verify(bytes, asset, source) {
  if (bytes.length !== asset.size) {
    throw new Error(`${source}: expected ${asset.size} bytes, got ${bytes.length}`);
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== asset.sha256) {
    throw new Error(`${source}: SHA-256 mismatch (got ${digest})`);
  }
}

async function fetchVerified(asset) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(asset.url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(30000),
        headers: { 'user-agent': 'LinuxLab-firmware-fetch/1.0' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      await verify(bytes, asset, asset.url);
      return bytes;
    } catch (error) {
      lastError = error;
      if (attempt < 4) {
        console.warn(`[LinuxLab] Firmware fetch attempt ${attempt}/4 failed for ${asset.path}: ${error.message}; retrying.`);
        await sleep(attempt * 1000);
      }
    }
  }
  throw new Error(`Unable to retrieve verified firmware ${asset.path} after 4 attempts from ${asset.url}: ${lastError?.message ?? 'unknown error'}`);
}

for (const asset of assets) {
  const target = resolve(asset.path);
  try {
    const bytes = await readFile(target);
    await verify(bytes, asset, target);
    console.log(`[LinuxLab] Verified existing ${asset.path}`);
    continue;
  } catch (error) {
    console.warn(`[LinuxLab] Existing ${asset.path} is missing, an unresolved LFS pointer, or invalid (${error.message}); fetching pinned upstream bytes.`);
  }

  const bytes = await fetchVerified(asset);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  try {
    await writeFile(temporary, bytes, { mode: 0o644, flag: 'wx' });
    // Re-read and verify the staged file before atomically replacing the target.
    await verify(await readFile(temporary), asset, temporary);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

console.log('[LinuxLab] Verified pinned v86 SeaBIOS/VGABIOS firmware.');
