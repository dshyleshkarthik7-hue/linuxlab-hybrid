import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.PROFILE_BOOT_BASE_URL;
if (!base) { console.log('PROFILE_BOOT_BASE_URL not set; real ISO boot timing skipped.'); process.exit(0); }
const profiles = [
  ['developer','Developer Alpine v1.0.0',300000],
  ['virt','Alpine Virt 3.24.1',240000],
  ['linux4','Linux4 v3.00',90000],
];
const browser = await chromium.launch({ headless: true });
try {
  for (const [id,name,timeout] of profiles) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const started = Date.now();
    await page.goto(base + '/index-v86.html?profile=' + id, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => {
      const state = document.getElementById('v86-health')?.getAttribute('data-state');
      const text = document.getElementById('v86-status')?.textContent || '';
      return state === 'ready' || /ready|shell/i.test(text);
    }, { timeout });
    console.log(name + ': boot_ready_ms=' + (Date.now() - started));
    await page.keyboard.type('echo __LINUXLAB_INPUT_OK__');
    await page.close();
  }
} finally { await browser.close(); }
