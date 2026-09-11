import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const explicit = process.env.MOBILE_BASE_URL || process.argv[2];
const MOBILE_TIMEOUT_MS = Number(process.env.MOBILE_TIMEOUT_MS || 60000);
const baseURL = explicit || `http://127.0.0.1:${process.env.MOBILE_PORT || 4174}`;
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
  throw new Error(`Timed out waiting for mobile preview server at ${url}`);
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

async function run() {
  if (!explicit) {
    const port = process.env.MOBILE_PORT || '4174';
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

  const browser = await chromium.launch({ headless: true, timeout: 15000 });
  try {
    for (const device of [devices['iPhone 13'], devices['Pixel 7']]) {
      const page = await browser.newPage({ ...device });
      page.setDefaultTimeout(8000);
      page.setDefaultNavigationTimeout(15000);
      try {
        const response = await page.goto(baseURL + '/index.html', { waitUntil: 'domcontentloaded' });
        if (!response || !response.ok()) throw new Error(`${device.name}: homepage returned ${response?.status() ?? 'no response'}`);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (overflow) throw new Error(`horizontal overflow at ${device.name}`);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

const timer = setTimeout(() => {
  console.error(`Mobile browser E2E exceeded ${MOBILE_TIMEOUT_MS}ms`);
  stopServer();
  process.exitCode = 124;
}, MOBILE_TIMEOUT_MS);
timer.unref();

try {
  await run();
  console.log('Mobile browser E2E checks passed');
} finally {
  clearTimeout(timer);
  stopServer();
}
