import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
const { chromium } = createRequire(import.meta.url)('playwright');
const port = Number(process.env.REAL_GUEST_PORT || 4174);
const internalPort = Number(process.env.REAL_GUEST_INTERNAL_PORT || port + 2);
const baseURL = process.env.REAL_GUEST_BASE_URL || `http://127.0.0.1:${port}`;
const bootTimeoutMs = Number(process.env.REAL_GUEST_BOOT_TIMEOUT_MS || 120000);
const testTimeoutMs = Number(process.env.REAL_GUEST_TEST_TIMEOUT_MS || 5 * 60 * 1000);
const isoTimeoutMs = Number(process.env.REAL_GUEST_ISO_FETCH_TIMEOUT_MS || 90000);
const proxyTimeoutMs = Number(process.env.REAL_GUEST_PROXY_TIMEOUT_MS || 30000);
const isoURL = 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/V2.00/alpine-virt-3.24.1-x86.iso';
let vite; let proxy; let browser; let context;
const log = (s, m) => console.log(`[real-guest][${s}] ${m}`);
const stop = child => { try { child?.kill('SIGTERM'); } catch {} };
async function waitFor(url) { const end = Date.now() + 30000; while (Date.now() < end) { try { if ((await fetch(url, { signal: AbortSignal.timeout(5000) })).ok) return; } catch {} await sleep(250); } throw new Error(`Timed out waiting for ${url}`); }
if (process.env.REAL_GUEST_SKIP === '1') { if (process.env.REAL_GUEST_CHROMIUM_UNAVAILABLE !== '1') throw new Error('REAL_GUEST_SKIP=1 requires REAL_GUEST_CHROMIUM_UNAVAILABLE=1'); console.log('REAL_GUEST_SKIP=1: explicit Chromium-unavailable environment; security gate is not silently bypassed.'); process.exit(0); }
const deadline = setTimeout(() => { console.error(`guest boot timeout: real guest isolation gate exceeded ${testTimeoutMs}ms`); stop(vite); try { proxy?.close(); } catch {} process.exit(124); }, testTimeoutMs); deadline.unref();
try {
  if (!process.env.REAL_GUEST_BASE_URL) {
    const viteBin = resolve('node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
    log('server', 'starting Vite preview'); vite = spawn(viteBin, ['preview', '--host', '127.0.0.1', '--port', String(internalPort), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] }); vite.stderr.on('data', d => process.stderr.write(`[vite] ${d}`)); await waitFor(`http://127.0.0.1:${internalPort}`);
    log('iso', `fetching Alpine Virt 3.24.1; deadline=${isoTimeoutMs}ms`); const response = await fetch(isoURL, { redirect: 'follow', signal: AbortSignal.timeout(isoTimeoutMs) }); if (!response.ok) throw new Error(`Alpine Virt ISO download failed (${response.status})`); const iso = Buffer.from(await response.arrayBuffer()); if (!iso.length) throw new Error('Alpine Virt ISO is empty'); log('iso', `loaded ${iso.length} bytes`);
    proxy = require('node:http').createServer(async (req, res) => { try { const u = new URL(req.url || '/', baseURL); if (u.pathname === '/api/iso' && u.searchParams.get('image') === 'virt') { res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': iso.length, 'accept-ranges': 'bytes' }); res.end(iso); return; } const upstream = await fetch(`http://127.0.0.1:${internalPort}${u.pathname}${u.search}`, { signal: AbortSignal.timeout(proxyTimeoutMs) }); res.statusCode = upstream.status; for (const h of ['content-type','content-length','cache-control','etag']) { const v = upstream.headers.get(h); if (v) res.setHeader(h, v); } res.end(upstream.body ? Buffer.from(await upstream.arrayBuffer()) : undefined); } catch (e) { res.writeHead(502); res.end(`CI proxy failed: ${e instanceof Error ? e.message : String(e)}`); } }); await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(port, '127.0.0.1', resolve); }); log('proxy', `ready; deadline=${proxyTimeoutMs}ms`);
  }
  log('browser', 'launching Chromium'); browser = await chromium.launch({ headless: true, timeout: 15000 }); log('browser', 'Chromium launched'); context = await browser.newContext(); const page = await context.newPage();
  page.on('pageerror', e => process.stderr.write(`[browser pageerror] ${e.message}\n`)); page.on('console', m => { if (m.type() === 'error') process.stderr.write(`[browser console] ${m.text()}\n`); });
  log('page', 'loading Alpine Virt page'); await page.goto(`${baseURL}/index-v86.html?profile=virt`, { waitUntil: 'domcontentloaded', timeout: 30000 }); log('page', 'loaded'); await page.waitForSelector('#v86-status', { timeout: 10000 });
  log('vm', `waiting for Alpine Virt guest; deadline=${bootTimeoutMs}ms`); await page.waitForFunction(() => document.querySelector('#v86-health')?.getAttribute('data-state') === 'ready' || document.querySelector('#v86-health')?.getAttribute('data-state') === 'offline', null, { timeout: bootTimeoutMs }).catch(() => { throw new Error('guest boot timeout'); });
  const state = await page.locator('#v86-health').getAttribute('data-state'); const status = await page.locator('#v86-status').textContent(); const text = await page.locator('#v86-terminal-container').innerText().catch(() => '');
  if (state !== 'ready') throw new Error(`Alpine Virt guest failed to become ready: ${status || '(empty)'}`);
  assert.match(text, /Alpine|login|localhost|Welcome/i); assert.doesNotMatch(text, /Buildroot|Linux 4/i); assert.doesNotMatch(status || '', /Linux 4/i);
  log('guest', 'Alpine Virt 3.24.1 ready; isolation gate passed');
} finally { clearTimeout(deadline); await context?.close().catch(() => {}); await browser?.close().catch(() => {}); try { proxy?.close(); } catch {} stop(vite); }
