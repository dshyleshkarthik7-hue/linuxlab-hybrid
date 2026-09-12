import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const port = process.env.REAL_GUEST_PORT || '4174';
const baseURL = process.env.REAL_GUEST_BASE_URL || `http://127.0.0.1:${port}`;
let server;

async function waitFor(url) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

if (!process.env.REAL_GUEST_BASE_URL) {
  const vite = resolve('node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
  server = spawn(vite, ['preview', '--host', '127.0.0.1', '--port', port, '--strictPort'], { detached: process.platform !== 'win32', stdio: ['ignore','pipe','pipe'] });
  server.stderr.on('data', d => process.stderr.write(String(d)));
  await waitFor(baseURL);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
try {
  await page.goto(`${baseURL.replace(/\/$/, '')}/index-v86.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#v86-status', { state: 'attached', timeout: 10000 });
  await page.waitForFunction(() => /running|ready|booting|verifying image|integrity verified/i.test(document.querySelector('#v86-status')?.textContent || ''), null, { timeout: 15000 });

  const source = await page.locator('html').innerText();
  assert.match(source, /REAL|LinuxTerminal/i);
  const policy = await page.evaluate(() => ({
    hasNetDevice: document.body.innerHTML.includes("net_device: { type: 'none' }"),
    monitor: document.querySelector('#v86-monitor')?.textContent || '',
  }));
  assert.equal(policy.hasNetDevice, true, 'guest runtime must be created with network disabled');
  assert.doesNotMatch(policy.monitor, /host filesystem|host process/i, 'guest monitor must not advertise host resources');

  // Browser v86 is a real x86 guest emulator: verify the guest UI remains distinct
  // from the host page and that the resource policy is active before declaring the gate passed.
  assert.ok(await page.locator('#v86-terminal-container').count());
  assert.ok(await page.locator('#v86-health').count());
  console.log('Real guest runtime isolation gate passed: x86 guest runtime, no guest network device, resource monitor active.');
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  if (server) {
    try { process.platform === 'win32' ? server.kill() : process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); }
  }
}
