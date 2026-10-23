import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const playwright = require('playwright');
const browserName = process.env.A11Y_BROWSER || 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(browserName)) throw new Error('A11Y_BROWSER must be chromium, firefox, or webkit');
const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
const explicit = process.env.A11Y_BASE_URL || process.argv[2];
const port = process.env.A11Y_PORT || '4174';
const baseURL = explicit || `http://127.0.0.1:${port}`;
const routes = [
  { path: '/', url: '/' }, { path: '/learn/', url: '/learn/' }, { path: '/quiz/', url: '/quiz/' },
  { path: '/progress/', url: '/progress/' }, { path: '/certificate/', url: '/certificate/' }, { path: '/verify/', url: '/verify/' },
  // Vite preview does not apply Netlify rewrites; audit the actual target documents.
  { path: '/real-linux/', url: '/index-v86.html', expected: '#vm-header' },
  { path: '/developer-alpine/', url: '/developer-alpine/', expected: 'main' },
  { path: '/challenges/', url: '/challenges/' }, { path: '/linux-careers.html', url: '/linux-careers.html', expected: '.career-wrap' },
  { path: '/linux-careers/', url: '/linux-careers.html', expected: '.career-wrap' }
];
let server;

async function waitForServer(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) return; } catch {}
    await sleep(200);
  }
  throw new Error('Timed out waiting for accessibility preview server at ' + url);
}
function stopServer() {
  if (!server || server.exitCode !== null) return;
  try { if (process.platform === 'win32') server.kill(); else process.kill(-server.pid, 'SIGTERM'); }
  catch { try { server.kill('SIGTERM'); } catch {} }
  server = undefined;
}
if (!explicit) {
  const viteBin = resolve('node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
  server = spawn(viteBin, ['preview', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'], env: process.env, detached: process.platform !== 'win32'
  });
  server.stdout.on('data', data => process.stdout.write(String(data)));
  server.stderr.on('data', data => process.stderr.write(String(data)));
  await waitForServer(baseURL);
}
const browser = await playwright[browserName].launch({ headless: true });
const serious = [];
const other = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(axeSource);
  for (const item of routes) {
    const route = item.path;
    const response = await page.goto(baseURL + item.url, { waitUntil: 'domcontentloaded' });
    if (item.expected && !(await page.locator(item.expected).count())) throw new Error(route + ' did not render expected page selector ' + item.expected);
    if (!response || response.status() >= 400) throw new Error(route + ' returned HTTP ' + (response?.status() ?? 'no response'));
    if (route === '/') {
      const ctas = await page.locator('a.btn').evaluateAll(elements =>
        elements.map(element => {
          const style = getComputedStyle(element);
          const rgb = value => value.match(/[\\d.]+/g)?.slice(0, 3).map(Number) ?? [];
          const luminance = value => {
            const channels = rgb(value).map(channel => channel / 255).map(channel =>
              channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
            return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
          };
          const foreground = luminance(style.color);
          const background = luminance(style.backgroundColor);
          const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
          return { href: element.getAttribute('href'), color: style.color, backgroundColor: style.backgroundColor,
            textFillColor: style.webkitTextFillColor, contrast: Number(ratio.toFixed(2)) };
        })
      );
      for (const cta of ctas) {
        if (cta.contrast < 4.5 || cta.color !== 'rgb(255, 255, 255)' ||
            cta.textFillColor !== 'rgb(255, 255, 255)') {
          throw new Error('Homepage button failed WCAG AA contrast guard: ' + JSON.stringify(cta));
        }
      }
      const heading = await page.locator('.developer-guide > .compare-grid > div:nth-child(1) > h3').evaluate(element => {
        const style = getComputedStyle(element);
        return { color: style.color, backgroundColor: style.backgroundColor };
      });
      if (heading.color === 'rgb(21, 34, 52)' || heading.color === 'rgb(20, 34, 52)') {
        throw new Error('Homepage comparison heading is still using a low-contrast foreground: ' + JSON.stringify(heading));
      }
    }
    const result = await page.evaluate(async () => {
      const report = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }
      });
      return {
        violations: report.violations.map(v => ({
          id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl,
          nodes: v.nodes.slice(0, 8).map(n => ({ target: n.target, summary: n.failureSummary }))
        }))
      };
    });
    for (const violation of result.violations) {
      const item = { route, ...violation };
      if (['critical', 'serious'].includes(violation.impact)) serious.push(item);
      else other.push(item);
    }
  }
} finally {
  await browser.close();
  stopServer();
}
for (const item of [...serious, ...other]) console.log(JSON.stringify(item));
if (serious.length) {
  console.error('axe-core found ' + serious.length + ' serious/critical violation groups; details are printed above.');
  process.exitCode = 1;
} else {
  console.log('axe-core found no serious/critical violations across ' + routes.length + ' routes in ' + browserName + '. ' + other.length + ' moderate/minor groups remain for review.');
}
