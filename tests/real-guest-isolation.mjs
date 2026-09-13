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
const bootTimeoutMs = Number(process.env.REAL_GUEST_BOOT_TIMEOUT_MS || 90000);
const testTimeoutMs = Number(process.env.REAL_GUEST_TEST_TIMEOUT_MS || 8 * 60 * 1000);
const isoFetchTimeoutMs = Number(process.env.REAL_GUEST_ISO_FETCH_TIMEOUT_MS || 60000);
const proxyTimeoutMs = Number(process.env.REAL_GUEST_PROXY_TIMEOUT_MS || 30000);
const isoSources = { linux4: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v3.00/linux4.iso' };
let viteServer; let proxyServer;
const log = message => console.log(`[real-guest] ${message}`);
const killProcessTree = child => {
  if (!child || child.exitCode !== null) return;
  try { if (process.platform === 'win32') child.kill(); else process.kill(-child.pid, 'SIGTERM'); }
  catch { try { child.kill('SIGTERM'); } catch {} }
};
const testDeadline = setTimeout(() => {
  console.error(`Real guest isolation gate timed out after ${testTimeoutMs}ms`);
  killProcessTree(viteServer); try { proxyServer?.close(); } catch {}
  process.exit(124);
}, testTimeoutMs); testDeadline.unref();
async function waitFor(url) { const deadline = Date.now() + 30000; while (Date.now() < deadline) { try { const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); if (r.ok) return; } catch {} await sleep(250); } throw new Error(`Timed out waiting for ${url}`); }
function parseRange(range, length) { const match = /^bytes=(\d+)-(\d*)$/.exec(range || ''); if (!match) return null; const start = Number(match[1]); const requestedEnd = match[2] ? Number(match[2]) : length - 1; if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= length || start > requestedEnd) return null; return { start, end: Math.min(requestedEnd, length - 1) }; }
if (!process.env.REAL_GUEST_BASE_URL) {
  const vite = resolve('node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
  log(`browser launch server start; proxy deadline=${proxyTimeoutMs}ms`);
  viteServer = spawn(vite, ['preview', '--host', '127.0.0.1', '--port', String(internalPort), '--strictPort'], { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  viteServer.stderr.on('data', d => process.stderr.write(String(d))); await waitFor(`http://127.0.0.1:${internalPort}`); log('preview server ready');
  log(`ISO fetch start; hard deadline=${isoFetchTimeoutMs}ms`);
  const isoResponse = await fetch(isoSources.linux4, { redirect: 'follow', headers: { 'accept-encoding': 'identity' }, signal: AbortSignal.timeout(isoFetchTimeoutMs) });
  if (!isoResponse.ok) throw new Error(`Linux 4 ISO download failed (${isoResponse.status})`); const linux4Iso = Buffer.from(await isoResponse.arrayBuffer()); if (!linux4Iso.length) throw new Error('Linux 4 ISO download returned an empty file'); log(`ISO fetch complete: ${linux4Iso.length} bytes`);
  proxyServer = createServer(async (req, res) => { try { const requestUrl = new URL(req.url || '/', baseURL); if (requestUrl.pathname === '/api/iso' && requestUrl.searchParams.get('image') === 'linux4') { const range = parseRange(req.headers.range, linux4Iso.length); const body = range ? linux4Iso.subarray(range.start, range.end + 1) : linux4Iso; res.statusCode = range ? 206 : 200; res.setHeader('content-type', 'application/octet-stream'); res.setHeader('content-length', body.length); res.setHeader('accept-ranges', 'bytes'); if (range) res.setHeader('content-range', `bytes ${range.start}-${range.end}/${linux4Iso.length}`); res.end(body); return; } const upstreamUrl = `http://127.0.0.1:${internalPort}${requestUrl.pathname}${requestUrl.search}`; const headers = { ...req.headers, 'accept-encoding': 'identity' }; delete headers.host; const upstream = await fetch(upstreamUrl, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req, redirect: 'manual', signal: AbortSignal.timeout(proxyTimeoutMs) }); res.statusCode = upstream.status; for (const name of ['content-type','content-length','cache-control','etag','last-modified','location']) { const value = upstream.headers.get(name); if (value) res.setHeader(name, value); } if (!upstream.body) { res.end(); return; } const reader = upstream.body.getReader(); for (;;) { const { done, value } = await reader.read(); if (done) break; if (!res.write(Buffer.from(value))) await new Promise(resolveDrain => res.once('drain', resolveDrain)); } res.end(); } catch (error) { if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' }); res.end(`CI proxy failed: ${error instanceof Error ? error.message : String(error)}`); } });
  await new Promise((resolveListen, reject) => { proxyServer.once('error', reject); proxyServer.listen(port, '127.0.0.1', resolveListen); }); log(`proxy ready with independent ${proxyTimeoutMs}ms hard deadline`);
}
log('browser launch start');
let browser;
try { browser = await chromium.launch({ headless: true, timeout: 15000 }); }
catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (process.env.REAL_GUEST_SKIP === '1' && process.env.REAL_GUEST_CHROMIUM_UNAVAILABLE === '1') {
    console.warn(`REAL_GUEST_SKIP=1 accepted only because REAL_GUEST_CHROMIUM_UNAVAILABLE=1 and Chromium launch failed: ${message}`);
    clearTimeout(testDeadline); killProcessTree(viteServer); try { proxyServer?.close(); } catch {}
    process.exit(0);
  }
  throw new Error(`Chromium launch failed; real guest security gate was not bypassed: ${message}`, { cause: error });
}
log('browser launch complete'); const context = await browser.newContext(); const page = await context.newPage();
try {
  page.on('pageerror', error => process.stderr.write(`[browser pageerror] ${error.message}\n`)); page.on('console', message => { if (message.type() === 'error') process.stderr.write(`[browser console] ${message.text()}\n`); if (message.text().includes('[linux4]')) process.stdout.write(`[browser] ${message.text()}\n`); });
  log('page load start'); await page.goto(`${baseURL.replace(/\/$/, '')}/linux4.html`, { waitUntil: 'domcontentloaded', timeout: 30000 }); log('page load complete');
  await page.waitForSelector('#linux4-status', { state: 'attached', timeout: 10000 });
  log(`guest readiness wait start; deadline=${bootTimeoutMs}ms`);
  try { await page.waitForFunction(() => { const health = document.querySelector('#linux4-health')?.getAttribute('data-state'); return health === 'ready' || health === 'offline'; }, null, { timeout: bootTimeoutMs }); }
  catch (error) { console.error(`guest boot timeout after ${bootTimeoutMs}ms`); throw new Error(`guest boot timeout after ${bootTimeoutMs}ms`, { cause: error }); }
  const state = await page.locator('#linux4-health').getAttribute('data-state'); const status = await page.locator('#linux4-status').textContent(); const terminal = await page.locator('#linux4-terminal').innerText().catch(() => '');
  if (state !== 'ready') throw new Error(`Linux 4 guest failed to become ready: status=${status || '(empty)'}, terminal=${terminal.slice(-1000) || '(empty)'}`);
  const runtime = await page.evaluate(() => ({ page: location.pathname, config: window.__linux4VmConfig, v86Present: typeof window.V86 === 'function' }));
  assert.equal(runtime.page, '/linux4.html'); assert.equal(runtime.v86Present, true); assert.ok(runtime.config, 'Linux 4 runtime configuration is missing'); assert.equal(runtime.config.profile, 'linux4'); assert.equal(runtime.config.networkEnabled, false, 'Linux 4 network must be disabled'); assert.equal(runtime.config.integrityVerified, true, 'Linux 4 ISO must be integrity verified before readiness'); assert.equal(runtime.config.guestReady, true, 'Linux 4 readiness must be guest readiness'); assert.ok(Number.isInteger(runtime.config.memoryBytes) && runtime.config.memoryBytes > 0, 'memory policy must be applied'); assert.ok(Number.isInteger(runtime.config.vgaMemoryBytes) && runtime.config.vgaMemoryBytes > 0, 'VGA memory policy must be applied');
  const html = await page.locator('#linux4-terminal').innerHTML().catch(() => ''); assert.doesNotMatch(html, /Developer Alpine/i); log('real guest isolation gate passed: verified Linux 4 guest, runtime network isolation, integrity, readiness, and resource configuration.');
} finally { clearTimeout(testDeadline); await context.close().catch(() => {}); await browser.close().catch(() => {}); if (proxyServer) await new Promise(r => proxyServer.close(() => r())).catch(() => {}); killProcessTree(viteServer); }
