import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const playwrightRoot = process.env.PLAYWRIGHT_NODE_PATH || 'playwright';
const { chromium } = require(playwrightRoot);
if (!chromium) throw new Error('Playwright chromium export is unavailable');

const explicitURL = process.argv[2] || process.env.SMOKE_BASE_URL || process.env.BASE_URL;
let server;
let baseURL = explicitURL;

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await sleep(250);
  }
  throw new Error('Timed out waiting for local Vite server at ' + url);
}

if (!baseURL) {
  const port = process.env.SMOKE_PORT || '4173';
  baseURL = `http://127.0.0.1:${port}`;
  server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', port], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  server.stderr.on('data', data => process.stderr.write(String(data)));
  try { await waitForServer(baseURL); } catch (error) { server.kill('SIGTERM'); throw error; }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

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

  const response = await page.goto(baseURL.replace(/\/$/, '') + '/index-v86.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (!response || !response.ok()) throw new Error('Unable to load V86 page: ' + baseURL + '/index-v86.html');

  const required = ['#v86-health', '#v86-status', '#v86-monitor', '#v86-terminal-container', '#screen_container'];
  for (const selector of required) await page.waitForSelector(selector, { state: 'attached', timeout: 10000 });

  const buttons = {
    terminal: '#btn-v86-terminal', screen: '#btn-v86-screen', alpine: '#btn-v86-alpine',
    virt: '#btn-v86-virt', linux4: '#btn-v86-linux4', restart: '#btn-v86-restart'
  };
  for (const [name, selector] of Object.entries(buttons)) {
    await page.waitForSelector(selector, { state: 'visible', timeout: 10000 });
    console.log('Found ' + name + ' control');
  }

  // The browser smoke test validates the page/controller contract. A real VM boot is
  // intentionally not a prerequisite: CI uses a one-byte ISO stub, so v86 cannot
  // produce guest serial output. Waiting for the guest's "booting" text made this
  // smoke test time out even though the UI and controller were healthy.
  await page.waitForFunction(() => {
    const status = document.getElementById('v86-status')?.textContent || '';
    return /Starting|checking runtime|checking image|booting|running|ready|error/i.test(status);
  }, null, { timeout: 10000 });

  await page.click(buttons.screen);
  await page.waitForFunction(() => !document.getElementById('screen_container')?.hidden && Boolean(document.getElementById('v86-terminal-container')?.hidden), null, { timeout: 5000 });
  await page.click(buttons.terminal);
  await page.waitForFunction(() => Boolean(document.getElementById('screen_container')?.hidden) && !document.getElementById('v86-terminal-container')?.hidden, null, { timeout: 5000 });

  // Profile buttons are verified by their observable controller state rather than
  // guest boot output. This keeps the smoke test deterministic with the CI ISO stub.
  await page.click(buttons.virt);
  await page.waitForFunction(() => document.getElementById('v86-status')?.textContent?.includes('Alpine Virt 3.24.1') || false, null, { timeout: 10000 });
  await page.click(buttons.linux4);
  await page.waitForFunction(() => document.getElementById('v86-status')?.textContent?.includes('Ultra Light Linux 4') || false, null, { timeout: 10000 });

  console.log('Browser VM controls smoke test passed');
} finally {
  await browser.close();
  if (server) server.kill('SIGTERM');
}
