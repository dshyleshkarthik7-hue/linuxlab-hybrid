import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
if (!chromium) throw new Error('Playwright chromium export is unavailable');

const SMOKE_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 90000);
const explicitURL = process.argv[2] || process.env.SMOKE_BASE_URL || process.env.BASE_URL;
let server;
let baseURL = explicitURL;

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('Timed out waiting for local Vite server at ' + url);
}

function stopServer() {
  if (!server || server.exitCode !== null) return;
  try {
    if (process.platform === 'win32') server.kill();
    else process.kill(-server.pid, 'SIGTERM');
  } catch {
    try { server.kill('SIGTERM'); } catch {}
  }
  server = undefined;
}

async function runSmoke() {
  if (!baseURL) {
    const port = process.env.SMOKE_PORT || '4173';
    baseURL = `http://127.0.0.1:${port}`;
    const viteBin = resolve('node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
    server = spawn(viteBin, ['preview', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      detached: process.platform !== 'win32'
    });
    server.stderr.on('data', data => process.stderr.write(String(data)));
    server.on('error', error => { throw error; });
    await waitForServer(baseURL);
  }

  const browser = await chromium.launch({ headless: true, timeout: 15000 });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(20000);

  try {
    await page.route('**/api/iso**', async route => {
      const range = route.request().headers().range;
      await route.fulfill({
        status: range ? 206 : 200,
        headers: range
          ? { 'content-range': 'bytes 0-0/1', 'accept-ranges': 'bytes', 'content-length': '1', 'content-type': 'application/octet-stream' }
          : { 'content-length': '1', 'content-type': 'application/octet-stream' },
        body: Buffer.from([0])
      });
    });

    const response = await page.goto(baseURL.replace(/\/$/, '') + '/index-v86.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
    if (!response || !response.ok()) throw new Error('Unable to load V86 page: ' + baseURL + '/index-v86.html');

    const required = ['#v86-health', '#v86-status', '#v86-monitor', '#v86-terminal-container', '#screen_container'];
    for (const selector of required) await page.waitForSelector(selector, { state: 'attached' });

    const buttons = {
      terminal: '#btn-v86-terminal', screen: '#btn-v86-screen', alpine: '#btn-v86-alpine',
      virt: '#btn-v86-virt', linux4: '#btn-v86-linux4', restart: '#btn-v86-restart'
    };
    for (const [name, selector] of Object.entries(buttons)) {
      await page.waitForSelector(selector, { state: 'visible' });
      console.log('Found ' + name + ' control');
    }

    await page.waitForFunction(() => {
      const status = document.getElementById('v86-status')?.textContent || '';
      return /Starting|checking runtime|checking image|booting|running|ready|error/i.test(status);
    });

    await page.click(buttons.screen);
    await page.waitForFunction(() => !document.getElementById('screen_container')?.hidden && Boolean(document.getElementById('v86-terminal-container')?.hidden));
    await page.click(buttons.terminal);
    await page.waitForFunction(() => Boolean(document.getElementById('screen_container')?.hidden) && !document.getElementById('v86-terminal-container')?.hidden);

    await page.click(buttons.virt);
    await page.waitForFunction(() => document.getElementById('v86-status')?.textContent?.includes('Alpine Virt 3.24.1') || false);
    await page.click(buttons.linux4);
    await page.waitForFunction(() => document.getElementById('v86-status')?.textContent?.includes('Ultra Light Linux 4') || false);

    console.log('Browser VM controls smoke test passed');
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

const timer = setTimeout(() => {
  console.error(`Browser VM smoke test exceeded ${SMOKE_TIMEOUT_MS}ms`);
  stopServer();
  process.exitCode = 124;
}, SMOKE_TIMEOUT_MS);
timer.unref();

try {
  await runSmoke();
} finally {
  clearTimeout(timer);
  stopServer();
}
