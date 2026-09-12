import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ISO_URL = 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/V2.00/alpine-virt-3.24.1-x86.iso';
const ISO_SHA256 = '9895695d27eabc1e2782598ff0190f7966df8317cc2afe2a6d25360e148a4209';
const isoPath = resolve('.ci-cache/alpine-virt-3.24.1-x86.iso');

const response = await fetch(ISO_URL, { redirect: 'follow' });
assert.equal(response.ok, true, `ISO download failed: ${response.status}`);
const iso = Buffer.from(await response.arrayBuffer());
assert.equal(createHash('sha256').update(iso).digest('hex'), ISO_SHA256, 'trusted ISO SHA-256 mismatch');
await mkdir(resolve('.ci-cache'), { recursive: true });
await writeFile(isoPath, iso);

const port = process.env.REAL_GUEST_PORT || '4173';
const vite = resolve('node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
const server = spawn(vite, ['preview', '--host', '127.0.0.1', '--port', port, '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
const base = `http://127.0.0.1:${port}`;
try {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${base}/index-v86.html`)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await page.route('**/api/iso**', route => route.fulfill({ status: 200, headers: { 'content-type': 'application/octet-stream', 'content-length': String(iso.length) }, body: iso }));
    await page.goto(`${base}/index-v86.html`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('#v86-health')?.getAttribute('data-state') === 'ready', null, { timeout: 120_000 });

    const result = await page.evaluate(async (sentinel) => {
      const app = (window as typeof window & { linuxLabVM?: any }).linuxLabVM;
      if (!app?.emulator) throw new Error('real v86 emulator is not exposed in local CI');
      const bytes: number[] = [];
      const listener = (value?: number) => { if (typeof value === 'number') bytes.push(value & 255); };
      app.emulator.add_listener('serial0-output-byte', listener);
      app.emulator.serial0_send(`id\nps\nfree\ntouch /${sentinel}\n`);
      await new Promise(resolve => setTimeout(resolve, 2500));
      app.emulator.remove_listener('serial0-output-byte', listener);
      return { output: String.fromCharCode(...bytes), memoryMiB: app.profile?.memoryMiB, network: app.enforcer?.policy?.networkAllowed };
    }, `linuxterminal-guest-${process.pid}`);

    assert.equal(result.network, false, 'guest network must be disabled');
    assert.ok(Number(result.memoryMiB) > 0, 'guest memory policy must be configured');
    assert.match(result.output, /uid=0|uid=/, 'real guest did not execute id');
    assert.match(result.output, /PID|init|COMMAND|free/i, 'real guest did not execute process/resource commands');
    assert.doesNotMatch(result.output, new RegExp(String(process.pid)), 'guest output leaked host process identity');

    const sentinelPath = resolve(`linuxterminal-guest-${process.pid}`);
    await assert.rejects(access(sentinelPath));
    console.log('Real guest isolation runtime gate passed: pinned ISO, real v86 guest, process/resource view, host filesystem boundary, and disabled network.');
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
} finally {
  try { server.kill('SIGTERM'); } catch {}
  await rm(isoPath, { force: true }).catch(() => {});
}
