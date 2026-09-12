import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const port = Number(process.env.REAL_GUEST_PORT || 4174);
const internalPort = Number(process.env.REAL_GUEST_INTERNAL_PORT || port + 2);
const baseURL = process.env.REAL_GUEST_BASE_URL || `http://127.0.0.1:${port}`;
const bootTimeoutMs = Number(process.env.REAL_GUEST_BOOT_TIMEOUT_MS || 120000);
const isoSources = {
  developer: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso',
  virt: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/V2.00/alpine-virt-3.24.1-x86.iso',
  linux4: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v3.00/linux4.iso',
};
let viteServer;
let proxyServer;

async function waitFor(url) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function copyResponseHeaders(source, target, names) {
  for (const name of names) {
    const value = source.headers.get(name);
    if (value) target.setHeader(name, value);
  }
}

if (!process.env.REAL_GUEST_BASE_URL) {
  const vite = resolve('node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
  viteServer = spawn(vite, ['preview', '--host', '127.0.0.1', '--port', String(internalPort), '--strictPort'], {
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  viteServer.stderr.on('data', d => process.stderr.write(String(d)));
  await waitFor(`http://127.0.0.1:${internalPort}`);

  // Test-only same-origin front end. Node fetch transparently decodes compressed
  // upstream responses, so the proxy MUST NOT forward content-encoding or the
  // upstream content-length. Otherwise Chromium attempts to decode already
  // decoded bytes and reports ERR_CONTENT_DECODING_FAILED.
  proxyServer = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', baseURL);
      if (requestUrl.pathname === '/api/iso') {
        const image = requestUrl.searchParams.get('image') || 'developer';
        const upstream = isoSources[image] || isoSources.developer;
        const requestHeaders = {};
        if (req.headers.range) requestHeaders.range = req.headers.range;
        const upstreamResponse = await fetch(upstream, {
          headers: requestHeaders,
          redirect: 'follow',
        });
        res.statusCode = upstreamResponse.status;
        copyResponseHeaders(upstreamResponse, res, ['content-type', 'content-range', 'accept-ranges', 'etag', 'last-modified']);
        // Deliberately omit content-encoding/content-length: fetch() has already
        // decoded transfer/content encoding and Node will use chunked framing.
        if (!upstreamResponse.body) { res.end(); return; }
        const reader = upstreamResponse.body.getReader();
        req.on('close', () => reader.cancel().catch(() => {}));
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.write(Buffer.from(value))) await new Promise(resolveDrain => res.once('drain', resolveDrain));
        }
        res.end();
        return;
      }

      const upstreamUrl = `http://127.0.0.1:${internalPort}${requestUrl.pathname}${requestUrl.search}`;
      const upstreamRequest = await fetch(upstreamUrl, {
        method: req.method,
        headers: req.headers,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
        redirect: 'manual',
      });
      res.statusCode = upstreamRequest.status;
      // Strip hop-by-hop and entity encoding headers because fetch may decode the
      // Vite response before this proxy writes it to Chromium.
      const skip = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive']);
      upstreamRequest.headers.forEach((value, name) => { if (!skip.has(name)) res.setHeader(name, value); });
      if (!upstreamRequest.body) { res.end(); return; }
      const reader = upstreamRequest.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) await new Promise(resolveDrain => res.once('drain', resolveDrain));
      }
      res.end();
    } catch (error) {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`CI proxy failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  await new Promise((resolveListen, reject) => {
    proxyServer.once('error', reject);
    proxyServer.listen(port, '127.0.0.1', resolveListen);
  });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
try {
  page.on('pageerror', error => process.stderr.write(`[browser pageerror] ${error.message}\n`));
  page.on('console', message => { if (message.type() === 'error') process.stderr.write(`[browser console] ${message.text()}\n`); });

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
  if (proxyServer) await new Promise(resolveClose => proxyServer.close(() => resolveClose())).catch(() => {});
  if (viteServer) {
    try { process.platform === 'win32' ? viteServer.kill() : process.kill(-viteServer.pid, 'SIGTERM'); } catch { viteServer.kill(); }
  }
}
