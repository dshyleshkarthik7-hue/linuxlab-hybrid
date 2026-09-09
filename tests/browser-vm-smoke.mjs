import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwrightRoot = process.env.PLAYWRIGHT_NODE_PATH || 'playwright';
const { chromium } = require(playwrightRoot);
if (!chromium) throw new Error('Playwright chromium export is unavailable');

const baseURL = process.argv[2];
if (!baseURL) throw new Error('Missing base URL');

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

  // The Vite build emits index-v86.html for the /real-linux/ route only when
  // the hosting rewrite is present. CI's local server does not necessarily apply
  // that rewrite, so load the actual V86 entry directly.
  const response = await page.goto(baseURL + '/index-v86.html', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  if (!response || !response.ok()) {
    throw new Error('Unable to load V86 page: ' + baseURL + '/index-v86.html');
  }

  const required = [
    '#v86-health',
    '#v86-status',
    '#v86-monitor',
    '#v86-terminal-container',
    '#screen_container'
  ];

  for (const selector of required) {
    await page.waitForSelector(selector, { state: 'attached', timeout: 10000 });
  }

  const buttons = {
    terminal: '#btn-v86-terminal',
    screen: '#btn-v86-screen',
    alpine: '#btn-v86-alpine',
    virt: '#btn-v86-virt',
    linux4: '#btn-v86-linux4',
    restart: '#btn-v86-restart'
  };

  for (const [name, selector] of Object.entries(buttons)) {
    await page.waitForSelector(selector, { state: 'visible', timeout: 10000 });
    console.log('Found ' + name + ' control');
  }

  await page.waitForFunction(() => document.getElementById('v86-status')?.textContent?.includes('booting') || false, null, { timeout: 20000 });

  await page.click(buttons.screen);
  await page.waitForFunction(
    () => !document.getElementById('screen_container')?.hidden &&
      Boolean(document.getElementById('v86-terminal-container')?.hidden),
    null,
    { timeout: 10000 }
  );

  await page.click(buttons.terminal);
  await page.waitForFunction(
    () => Boolean(document.getElementById('screen_container')?.hidden) &&
      !document.getElementById('v86-terminal-container')?.hidden,
    null,
    { timeout: 10000 }
  );

  await page.click(buttons.virt);
  await page.waitForFunction(
    () => document.getElementById('v86-status')?.textContent?.includes('Alpine Virt') || false,
    null,
    { timeout: 20000 }
  );

  await page.click(buttons.linux4);
  await page.waitForFunction(
    () => document.getElementById('v86-status')?.textContent?.includes('Ultra Light Linux') || false,
    null,
    { timeout: 20000 }
  );

  console.log('Browser VM controls smoke test passed');
} finally {
  await browser.close();
}
