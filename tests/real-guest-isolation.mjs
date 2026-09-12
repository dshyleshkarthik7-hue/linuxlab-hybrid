import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const port = Number(process.env.REAL_GUEST_PORT || 4174);
const baseURL = process.env.REAL_GUEST_BASE_URL || `http://127.0.0.1:${port}`;
const bootTimeoutMs = Number(process.env.REAL_GUEST_BOOT_TIMEOUT_MS || 120000);
const isoSources = {
  developer: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso',
  virt: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/V2.00/alpine-virt-3.24.1-x86.iso',
  linux4: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v3.00/linux4.iso',
};
let server;
let proxyServer;
let proxyPort;

async function waitFor(url) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function startIsoProxy() {
  proxyServer = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${proxyPort || 0}`);
      const image = requestUrl.searchParams.get('image') || 'developer';
      const upstream = isoSources[image] || isoSources.developer;
      const headers = {};
      for (const name of ['range', 'if-range', 'if-none-match', 'if-modified-since']) {
        const value = req.headers[name];
        if (value) headers[name] = value;
      }
      const response = await fetch(upstream, { headers, redirect: 'follow' });
      res.writeHead(response.status, {
        'content-type': response.headers.get('content-type') || 'application/octet-stream',
        ...(response.headers.get('content-length') ? { 'content-length': response.headers.get('content-length') } : {}),
        ...(response.headers.get('content-range') ? { 'content-range': response.headers.get('content-range') } : {}),
        ...(response.headers.get('accept-ranges') ? { 'accept-ranges': response.headers.get('accept-ranges') } : {}),
        ...(response.headers.get('etag') ? { etag: response.headers.get('etag') } : {}),
        ...(response.headers.get('last-modified') ? { 'last-modified': response.headers.get('last-modified') } : {}),
      });
      if (response.body) {
        for await (const chunk of response.body) {
          if (!res.write(chunk)) await new Promise(resolveWrite => res.once('drain', resolveWrite));
        }
      }
      res.end();
    } catch (error) {
      res.destroy(error instanceof Error ? error : undefined);
    }
  });
  await new Promise((resolveListen, reject) => {
    proxyServer.once('error', reject);
    proxyServer.listen(0, '127.0.0.1', () => {
      proxyServer.removeListener('error', reject);
      proxyPort = proxyServer.address().port;
      resolveListen();
    });
  });
}

if (!process.env.REAL_GUEST_BASE_URL) {
  const vite = resolve('node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
  server = spawn(vite, ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  server.stderr.on('data', d => process.stderr.write(String(d)));
  await waitFor(baseURL);
  await startIsoProxy();
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
try {
  page.on('pageerror', error => process.stderr.write(`[browser pageerror] ${error.message}\n`));
  page.on('console', message => { if (message.type() === 'error') process.stderr.write(`[browser console] ${message.text()}\n`); });

  if (!process.env.REAL_GUEST_BASE_URL) {
    // Keep the intercepted URL HTTP→HTTP. The local proxy streams the large ISO,
    // avoiding Playwright's in-memory Buffer/string conversion limit for >512 MiB files.
    await page.route(`${baseURL.replace(/\/$/, '')}/api/iso**`, async route => {
      const requestUrl = new URL(route.request().url());
      const proxyUrl = `http://127.0.0.1:${proxyPort}/?${requestUrl.searchParams.toString()}`;
      await route.continue({ url: proxyUrl });
    });
  }

  await page.goto(`${baseURL.replace(/\/$/, '')}/index-v86.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#v86-status', { state: 'attached', timeout: 10000 });
  await page.locator('#btn-v86-virt').click();

  await page.waitForFunction(() => {
    const state = document.querySelector('#v86-health')?.getAttribute('data-state');
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
  if (proxyServer) await new Promise(resolveClose => proxyServer.close(() => resolveClose()));
  if (server) {
    try { process.platform === 'win32' ? server.kill() : process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); }
  }
}
