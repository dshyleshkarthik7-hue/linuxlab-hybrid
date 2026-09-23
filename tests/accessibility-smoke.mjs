import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const explicit = process.env.A11Y_BASE_URL || process.argv[2];
const port = process.env.A11Y_PORT || '4173';
const baseURL = explicit || `http://127.0.0.1:${port}`;
const routes = ['/', '/learn/', '/quiz/', '/progress/', '/certificate/', '/verify/'];
let server;

async function waitForServer(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error(`Timed out waiting for accessibility preview server at ${url}`);
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

if (!explicit) {
  const viteBin = resolve('node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
  server = spawn(viteBin, ['preview', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    detached: process.platform !== 'win32'
  });
  server.stdout.on('data', data => process.stdout.write(String(data)));
  server.stderr.on('data', data => process.stderr.write(String(data)));
  await waitForServer(baseURL);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  for (const route of routes) {
    await page.goto(baseURL + route, { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(() => {
      const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const badImages = [...document.images].filter(img => visible(img) && !img.alt);
      const unlabeled = [...document.querySelectorAll('input,select,textarea')].filter(el => visible(el) && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !(el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) && !el.closest('label'));
      const controls = [...document.querySelectorAll('button,a,[role="button"]')].filter(visible);
      const noText = controls.filter(el => !(el.textContent || '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title'));
      return { lang: document.documentElement.lang, title: document.title, badImages: badImages.length, unlabeled: unlabeled.length, noText: noText.length, h1: document.querySelectorAll('h1').length, overflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
    });
    if (!result.lang || !result.title || result.badImages || result.unlabeled || result.noText || result.h1 !== 1 || result.overflow) throw new Error(route + ' accessibility contract failed: ' + JSON.stringify(result));
    for (const width of [640, 2560]) {
      await page.setViewportSize({ width, height: 900 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error(route + ' overflows at ' + width + 'px');
    }
  }
} finally {
  await browser.close();
  stopServer();
}
console.log('Accessibility smoke checks passed');
