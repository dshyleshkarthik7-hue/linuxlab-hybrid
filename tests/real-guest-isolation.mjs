import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const port = process.env.REAL_GUEST_PORT || '4174';
const baseURL = process.env.REAL_GUEST_BASE_URL || `http://127.0.0.1:${port}`;
const bootTimeoutMs = Number(process.env.REAL_GUEST_BOOT_TIMEOUT_MS || 120000);
const isoSources = {
  developer: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso',
  virt: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/V2.00/alpine-virt-3.24.1-x86.iso',
  linux4: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v3.00/linux4.iso',
};
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
  page.on('pageerror', error => process.stderr.write(`[browser pageerror] ${error.message}\n`));
  page.on('console', message => { if (message.type() === 'error') process.stderr.write(`[browser console] ${message.text()}\n`); });

  // Vite preview does not execute Netlify Edge Functions. For local CI, fetch the
  // immutable release artifact from Node and fulfill the same-origin request.
  // The application still performs its normal SHA-256 verification before v86
  // receives the bytes. Do not use route.continue() here: Playwright forbids
  // changing the protocol of a routed request. Content-Length/Content-Encoding
  // are deliberately omitted because Node fetch may transparently decode them.
  if (!process.env.REAL_GUEST_BASE_URL) {
    await page.route(`${baseURL.replace(/\/$/, '')}/api/iso**`, async route => {
      const requestUrl = new URL(route.request().url());
      const image = requestUrl.searchParams.get('image') || 'developer';
      const upstream = isoSources[image] || isoSources.developer;
      const upstreamResponse = await fetch(upstream, { redirect: 'follow' });
      const body = Buffer.from(await upstreamResponse.arrayBuffer());
      const headers = {};
      for (const name of ['content-type', 'accept-ranges', 'content-range', 'etag', 'last-modified']) {
        const value = upstreamResponse.headers.get(name);
        if (value) headers[name] = value;
      }
      await route.fulfill({ status: upstreamResponse.status, headers, body });
    });
  }

  await page.goto(`${baseURL.replace(/\/$/, '')}/index-v86.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#v86-status', { state: 'attached', timeout: 10000 });

  // The developer image is retained as a separately tested production profile,
  // but the isolation gate boots the smaller pinned Alpine Virt image to avoid
  // making the mandatory CI gate depend on the custom developer image boot path.
  await page.locator('#btn-v86-virt').click();

  await page.waitForFunction(() => {
    const health = document.querySelector('#v86-health');
    const state = health?.getAttribute('data-state');
    return state === 'ready' || state === 'offline';
  }, null, { timeout: bootTimeoutMs });

  const state = await page.locator('#v86-health').getAttribute('data-state');
  const status = await page.locator('#v86-status').textContent();
  const terminal = await page.locator('#v86-terminal-container').innerText().catch(() => '');
  const monitor = await page.locator('#v86-monitor').textContent();
  if (state !== 'ready') {
    throw new Error(`Real guest failed to become ready: health=${state}, status=${status || '(empty)'}, monitor=${monitor || '(empty)'}, terminal=${terminal.slice(-1000) || '(empty)'}`);
  }

  const source = await page.locator('html').innerText();
  assert.match(source, /REAL|LinuxTerminal/i);
  const policy = await page.evaluate(() => ({
    hasNetDevice: document.body.innerHTML.includes("net_device: { type: 'none' }"),
    monitor: document.querySelector('#v86-monitor')?.textContent || '',
  }));
  assert.equal(policy.hasNetDevice, true, 'guest runtime must be created with network disabled');
  assert.doesNotMatch(policy.monitor, /host filesystem|host process/i, 'guest monitor must not advertise host resources');
  assert.ok(await page.locator('#v86-terminal-container').count());
  assert.ok(await page.locator('#v86-health').count());
  console.log(`Real guest runtime isolation gate passed: pinned Alpine Virt guest reached ready state within ${bootTimeoutMs}ms, network disabled, resource monitor active.`);
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  if (server) {
    try { process.platform === 'win32' ? server.kill() : process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); }
  }
}
