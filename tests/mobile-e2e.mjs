import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const explicit = process.env.MOBILE_BASE_URL || process.argv[2];
let server;
const baseURL = explicit || `http://127.0.0.1:${process.env.MOBILE_PORT || 4174}`;
if (!explicit) {
  const port = process.env.MOBILE_PORT || '4174';
  server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', port], { stdio: ['ignore', 'pipe', 'pipe'] });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) { try { if ((await fetch(baseURL)).ok) break; } catch {} await sleep(250); }
}
const browser = await chromium.launch({ headless: true });
try {
  for (const device of [devices['iPhone 13'], devices['Pixel 7']]) {
    const page = await browser.newPage({ ...device });
    await page.goto(baseURL + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) throw new Error(`horizontal overflow at ${device.name}`);
    await page.close();
  }
  console.log('Mobile browser E2E checks passed');
} finally { await browser.close(); if (server) server.kill('SIGTERM'); }
