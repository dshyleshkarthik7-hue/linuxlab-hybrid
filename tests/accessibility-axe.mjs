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
const routes = ['/', '/learn/', '/quiz/', '/progress/', '/certificate/', '/verify/', '/real-linux/', '/developer-alpine/', '/challenges/', '/linux-careers.html', '/linux-careers/'];
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
  for (const route of routes) {
    const response = await page.goto(baseURL + route, { waitUntil: 'domcontentloaded' });
    if (!response || response.status() >= 400) throw new Error(route + ' returned HTTP ' + (response?.status() ?? 'no response'));
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
