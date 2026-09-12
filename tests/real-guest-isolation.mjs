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
const testTimeoutMs = Number(process.env.REAL_GUEST_TEST_TIMEOUT_MS || 8 * 60 * 1000);
const isoFetchTimeoutMs = Number(process.env.REAL_GUEST_ISO_FETCH_TIMEOUT_MS || 60000);
const isoSources = { linux4: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v3.00/linux4.iso' };
let viteServer;
let proxyServer;
const testDeadline = setTimeout(() => {
  console.error(`Real guest isolation gate timed out after ${testTimeoutMs}ms`);
  try { viteServer?.kill('SIGTERM'); } catch {}
  try { proxyServer?.close(); } catch {}
  process.exit(124);
}, testTimeoutMs);
testDeadline.unref();

async function waitFor(url) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); if (r.ok) return; } catch {}
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
function parseRange(range, length) {
  const match = /^bytes=(\d+)-(\d*)$/.exec(range || '');
  if (!match) return null;
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : length - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= length || start > requestedEnd) return null;
  return { start, end: Math.min(requestedEnd, length - 1) };
}

if (!process.env.REAL_GUEST_BASE_URL) {
  const vite = resolve('node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
  viteServer = spawn(vite, ['preview', '--host', '127.0.0.1', '--port', String(internalPort), '--strictPort'], { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  viteServer.stderr.on('data', d => process.stderr.write(String(d)));
  await waitFor(`http://127.0.0.1:${internalPort}`);
  const isoResponse = await fetch(isoSources.linux4, { redirect: 'follow', headers: { 'accept-encoding': 'identity' }, signal: AbortSignal.timeout(isoFetchTimeoutMs) });
  if (!isoResponse.ok) throw new Error(`Linux 4 ISO download failed (${isoResponse.status})`);
  const linux4Iso = Buffer.from(await isoResponse.arrayBuffer());
  if (linux4Iso.length === 0) throw new Error('Linux 4 ISO download returned an empty file');
  console.log(`Loaded Linux 4 ISO fixture: ${linux4Iso.length} bytes`);
  proxyServer = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', baseURL);
      if (requestUrl.pathname === '/api/iso') {
        const range = parseRange(req.headers.range, linux4Iso.length);
        const body = range ? linux4Iso.subarray(range.start, range.end + 1) : linux4Iso;
        res.statusCode = range ? 206 : 200;
        res.setHeader('content-type', 'application/octet-stream');
        res.setHeader('content-length', body.length);
        res.setHeader('accept-ranges', 'bytes');
        if (range) res.setHeader('content-range', `bytes ${range.start}-${range.end}/${linux4Iso.length}`);
        res.end(body);
        return;
      }
      const upstreamUrl = `http://127.0.0.1:${internalPort}${requestUrl.pathname}${requestUrl.search}`;
      const requestHeaders = { ...req.headers, 'accept-encoding': 'identity' };
      delete requestHeaders.host;
      const upstreamResponse = await fetch(upstreamUrl, { method: req.method, headers: requestHeaders, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req, redirect: 'manual', signal: AbortSignal.timeout(30000) });
      res.statusCode = upstreamResponse.status;
      for (const name of ['content-type', 'content-length', 'cache-control', 'etag', 'last-modified', 'location']) { const value = upstreamResponse.headers.get(name); if (value) res.setHeader(name, value); }
      if (!upstreamResponse.body) { res.end(); return; }
      const reader = upstreamResponse.body.getReader();
      for (;;) { const { done, value } = await reader.read(); if (done) break; if (!res.write(Buffer.from(value))) await new Promise(resolveDrain => res.once('drain', resolveDrain)); }
      res.end();
    } catch (error) {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`CI proxy failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  await new Promise((resolveListen, reject) => { proxyServer.once('error', reject); proxyServer.listen(port, '127.0.0.1', resolveListen); });
}

const browser = await chromium.launch({ headless: true, timeout: 15000 });
const context = await browser.newContext();
const page = await context.newPage();
try {
  page.on('pageerror', error => process.stderr.write(`[browser pageerror] ${error.message}\n`));
  page.on('console', message => { if (message.type() === 'error') process.stderr.write(`[browser console] ${message.text()}\n`); });
  await page.goto(`${baseURL.replace(/\/$/, '')}/index-v86.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#v86-status', { state: 'attached', timeout: 10000 });
  // The page auto-starts Developer Alpine. Reuse that boot rather than
  // racing a second VM start for Linux 4. A real-guest gate must exercise
  // exactly one VM lifecycle and wait for the app's verified ready state.
  await page.waitForFunction(() => {
    const health = document.querySelector('#v86-health')?.getAttribute('data-state');
    const status = (document.querySelector('#v86-status')?.textContent || '').toLowerCase();
    return health === 'ready' || health === 'offline' || /failed|error|timeout|integrity/.test(status);
  }, null, { timeout: bootTimeoutMs });
  const state = await page.locator('#v86-health').getAttribute('data-state');
  const status = await page.locator('#v86-status').textContent();
  const terminal = await page.locator('#v86-terminal-container').innerText().catch(() => '');
  const monitor = await page.locator('#v86-monitor').textContent();
  if (state !== 'ready') throw new Error(`Real guest failed to become ready: health=${state}, status=${status || '(empty)'}, monitor=${monitor || '(empty)'}, terminal=${terminal.slice(-1000) || '(empty)'}`);
  const policy = await page.evaluate(() => ({
    hasNetDevice: document.body.innerHTML.includes("net_device: { type: 'none' }"),
    monitor: document.querySelector('#v86-monitor')?.textContent || '',
  }));
  assert.equal(policy.hasNetDevice, true, 'guest runtime must be created with network disabled');
  assert.doesNotMatch(policy.monitor, /host filesystem|host process/i, 'guest monitor must not advertise host resources');
  assert.ok(await page.locator('#v86-terminal-container').count());
  assert.ok(await page.locator('#v86-health').count());
  console.log(`Real guest runtime isolation gate passed: verified guest runtime ready, network disabled, resource monitor active.`);
} finally {
  clearTimeout(testDeadline);
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  if (proxyServer) await new Promise(resolveClose => proxyServer.close(() => resolveClose())).catch(() => {});
  if (viteServer) { try { process.platform === 'win32' ? viteServer.kill() : process.kill(-viteServer.pid, 'SIGTERM'); } catch { viteServer.kill(); } }
}