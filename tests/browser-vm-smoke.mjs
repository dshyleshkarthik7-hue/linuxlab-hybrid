import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
if (!chromium) throw new Error('Playwright chromium export is unavailable');

const SMOKE_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 90000);
const STAGE_TIMEOUT_MS = Number(process.env.SMOKE_STAGE_TIMEOUT_MS || 20000);
const explicitURL = process.argv[2] || process.env.SMOKE_BASE_URL || process.env.BASE_URL;
let server;
let baseURL = explicitURL;

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (response.ok) return; } catch {}
    await sleep(250);
  }
  throw new Error('Timed out waiting for local Vite server at ' + url);
}

function stopServer() {
  if (!server || server.exitCode !== null) return;
  try { process.platform === 'win32' ? server.kill() : process.kill(-server.pid, 'SIGTERM'); }
  catch { try { server.kill('SIGTERM'); } catch {} }
  server = undefined;
}

async function stage(page, name, action) {
  const started = Date.now();
  try {
    await Promise.race([action(), new Promise((_, reject) => setTimeout(() => reject(new Error(`${name} exceeded ${STAGE_TIMEOUT_MS}ms`)), STAGE_TIMEOUT_MS))]);
    console.log(`Smoke stage passed: ${name} (${Date.now()-started}ms)`);
  } catch (error) {
    const safe = name.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
    const path = resolve(process.env.SMOKE_ARTIFACT_DIR || 'test-artifacts', `browser-vm-${safe}.png`);
    await mkdir(resolve(path, '..'), { recursive: true }).catch(() => {});
    await page.screenshot({ path, fullPage: true }).catch(() => {});
    const diagnostics = await page.locator('body').innerText().catch(() => '');
    console.error(`Smoke stage failed: ${name}\n${diagnostics.slice(-5000)}\nScreenshot: ${path}`);
    throw error;
  }
}

async function runSmoke() {
  if (!baseURL) {
    const port = process.env.SMOKE_PORT || '4173'; baseURL = `http://127.0.0.1:${port}`;
    const viteBin = resolve('node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
    server = spawn(viteBin, ['preview', '--host', '127.0.0.1', '--port', port, '--strictPort'], { stdio: ['ignore','pipe','pipe'], env: process.env, detached: process.platform !== 'win32' });
    server.stderr.on('data', data => process.stderr.write(String(data)));
    server.on('error', error => { throw error; });
    await waitForServer(baseURL);
  }
  const browser = await chromium.launch({ headless: true, timeout: 15000 });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(STAGE_TIMEOUT_MS); page.setDefaultNavigationTimeout(STAGE_TIMEOUT_MS);
  try {
    page.on('console', message => { if (message.type() === 'error') console.error('[browser]', message.text()); });
    const manifest = JSON.parse(await readFile(resolve('artifacts', 'manifest.json'), 'utf8'));
    const firmwarePins = new Map(manifest.artifacts.filter((artifact) => artifact.release === 'v86-firmware-1').map((artifact) => [artifact.filename, artifact]));
    const firmware = new Map([
      ['seabios.bin', await readFile(resolve('public', 'seabios.bin'))],
      ['vgabios.bin', await readFile(resolve('public', 'vgabios.bin'))],
    ]);
    for (const [name, bytes] of firmware) {
      const pin = firmwarePins.get(name);
      if (!pin) throw new Error(`Missing firmware pin: ${name}`);
      if (bytes.byteLength !== pin.size) throw new Error(`Firmware fixture size mismatch: ${name}`);
      const actual = createHash('sha256').update(bytes).digest('hex');
      if (actual !== pin.sha256) throw new Error(`Firmware fixture SHA-256 mismatch: ${name}`);
    }
    await page.route('**/api/v86-firmware/**', async route => {
      const name = new URL(route.request().url()).pathname.split('/').pop();
      const body = firmware.get(name);
      if (!body) {
        await route.fulfill({ status: 404, headers: {'content-type':'text/plain'}, body: 'Not found' });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: {
          'content-type':'application/octet-stream',
          'content-length':String(body.length),
          'cache-control':'public, max-age=31536000, immutable',
        },
        body,
      });
    });
    await page.route('**/api/iso**', async route => {
      const url = new URL(route.request().url());
      const image = url.searchParams.get('image');
      if (image !== 'virt' && image !== 'developer') {
        await route.fulfill({ status: 404, headers: {'content-type':'text/plain'}, body: 'Unknown image' });
        return;
      }
      const range = route.request().headers().range;
      const headers = range
        ? {'content-range':'bytes 0-0/1','accept-ranges':'bytes','content-length':'1','content-type':'application/octet-stream'}
        : {'content-length':'1','content-type':'application/octet-stream'};
      await route.fulfill({ status: range ? 206 : 200, headers, body: Buffer.from([0]) });
    });
    await stage(page, 'page-load', async () => { const response = await page.goto(baseURL.replace(/\/$/,'') + '/index-v86.html', { waitUntil:'domcontentloaded' }); if (!response || !response.ok()) throw new Error('Unable to load V86 page'); });
    const required=['#v86-health','#v86-status','#v86-monitor','#v86-terminal-container','#screen_container'];
    await stage(page, 'required-controls', async () => { for (const selector of required) await page.waitForSelector(selector,{state:'attached'}); });
    const buttons={terminal:'#btn-v86-terminal',screen:'#btn-v86-screen',virt:'#btn-v86-virt',restart:'#btn-v86-restart'};
    await stage(page, 'button-availability', async () => { for (const [name,selector] of Object.entries(buttons)){await page.waitForSelector(selector,{state:'visible'});console.log('Found '+name+' control');} });
    // Exercise the visibility controls before v86 starts executing the guest image. The smoke
    // route intentionally supplies a one-byte ISO, which is only a fetch/integrity fixture and
    // must not be allowed to enter the emulator's CPU loop before this UI contract is checked.
    await stage(page, 'screen-toggle', async () => { await page.click(buttons.screen); await page.waitForFunction(() => !document.getElementById('screen_container')?.hidden && Boolean(document.getElementById('v86-terminal-container')?.hidden)); await page.click(buttons.terminal); await page.waitForFunction(() => Boolean(document.getElementById('screen_container')?.hidden) && !document.getElementById('v86-terminal-container')?.hidden); });
    await stage(page, 'boot-status', async () => page.waitForFunction(() => {
      const status = document.getElementById('v86-status')?.textContent || '';
      const health = document.getElementById('v86-health')?.getAttribute('data-state') || '';
      if (/firmware failed|firmware unavailable|failed size verification|failed SHA-256|firmware.*(404|502)/i.test(status)) {
        throw new Error(`VM firmware startup failure: ${status}`);
      }
      return Boolean(health) && Boolean(status);
    }));
    await stage(page, 'alpine-profile-switching', async () => {
      await page.click(buttons.virt);
      await page.waitForFunction(() => document.getElementById('v86-status')?.textContent?.includes('Alpine Virt 3.24.1') || false);
      const developerLink = page.locator('#v86-controls a[href="/developer-alpine/"]');
      await developerLink.waitFor({ state: 'visible' });
      const href = await developerLink.getAttribute('href');
      if (href !== '/developer-alpine/') throw new Error('Developer Alpine navigation target changed unexpectedly');
    });
    console.log('Browser VM controls smoke test passed');
  } finally { await context.close().catch(()=>{}); await browser.close().catch(()=>{}); }
}
const timer=setTimeout(()=>{console.error(`Browser VM smoke test exceeded ${SMOKE_TIMEOUT_MS}ms`);stopServer();process.exitCode=124;},SMOKE_TIMEOUT_MS);timer.unref();
try { await runSmoke(); } finally { clearTimeout(timer); stopServer(); }