import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const read = path => readFile(path, 'utf8');
const artifacts = await read('src/core/artifacts.ts');
const manifest = JSON.parse(await read('artifacts/manifest.json'));
const policy = await read('src/engine/VMResourcePolicy.ts');
const runtime = await read('src/main-v86.ts');
const page = await read('index-v86.html');
const developerPage = await read('developer-alpine/index.html');
const home = await read('index.html');
const progressPage = await read('progress/index.html');
const careerPage = await read('linux-careers.html');

const profiles = [
  ['developer','DEVELOPER_ALPINE_ARTIFACT',691011584,1024],
  ['virt','ALPINE_ARTIFACT',51380224,256],
  ['linux4','LINUX4_ARTIFACT',7731200,256],
];
for (const [id, artifact, size, memory] of profiles) {
  assert.match(artifacts, new RegExp('export const ' + artifact + ' = artifact\\('));
  const manifestEntry = manifest.artifacts.find(item => item.filename === (artifact === 'DEVELOPER_ALPINE_ARTIFACT' ? 'alpine.iso' : artifact === 'ALPINE_ARTIFACT' ? 'alpine-virt-3.24.1-x86.iso' : 'linux4.iso'));
  assert.equal(manifestEntry?.size, size);
  assert.match(policy, new RegExp(id + ': \\{ memoryMiB: ' + memory));
}
assert.match(runtime, /Developer Alpine v1\.0\.0/);
assert.match(runtime, /use_parts: true/);
assert.match(runtime, /fixed_chunk_size: 32 \* 1024 \* 1024/);
assert.match(runtime, /size: artifact\.size/);
assert.match(runtime, /developer-\$\{artifact\.sha256\}/);
assert.match(runtime, /Alpine Virt 3\.24\.1/);
assert.match(runtime, /expectedGuest: 'alpine' \| 'buildroot'/);
assert.match(page, /data-v86-profile="linux4"/);
assert.doesNotMatch(runtime, /16 GB-class device/);
assert.match(developerPage, /data-v86-profile="developer"/);
assert.match(home, /href="\/linux-careers\/">Careers<\/a>/);
assert.match(home, /href="\.\/home\.css"/);
assert.match(progressPage, /href="\.\/progress\.css"/);
assert.match(progressPage, /<script type="module" src="\.\/progress\.js"><\/script>/, "progress page must load its UI module");
assert.match(careerPage, /<link rel="stylesheet" href="\.\/linux-careers\.css">/);
assert.match(careerPage, /href="\/linux-careers\/" aria-current="page"/);
for (const source of [page, developerPage]) {
  assert.match(source, /id="v86-terminal-container"/);
  assert.match(source, /id="screen_container"/);
  assert.match(source, /btn-v86-restart/);
  assert.match(source, /aria-label=/);
}
assert.match(runtime, /keyboard_send_text/);
assert.match(runtime, /keyboard_set_enabled/);
assert.match(runtime, /handleResize/);

const base = process.env.UI_UX_BASE_URL || 'http://127.0.0.1:4173';
let preview;
if (!process.env.UI_UX_BASE_URL) {
  preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173'], { stdio: 'ignore' });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(base + '/index-v86.html');
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'Vite preview server must start for the UI/UX contract test');
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
try {
  const uiRoutes = [
    '/', '/beginner/', '/intermediate/', '/expert/', '/learn/', '/learn/linux-basics/',
    '/learn/terminal-navigation/', '/learn/files-and-directories/', '/learn/text-processing/',
    '/learn/permissions/', '/learn/processes/', '/learn/shell-scripting/', '/learn/operating-systems/',
    '/learn/networking-basics/', '/commands/', '/challenges/', '/quiz/', '/progress/',
    '/certificate/', '/verify/', '/about/', '/contact/', '/privacy/', '/terms/', '/linux-careers/', '/real-linux/', '/developer-alpine/', '/open-source-iso/', '/curriculum/', '/404.html',
  ];
  for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1024, 768], [1440, 900], [2560, 1440]]) {
    await p.setViewportSize({ width, height });
    for (const route of uiRoutes) {
      const p = await context.newPage();
      const errors = [];
      const consoleHandler = message => { if (message.type() === 'error') errors.push(message.text()); };
      const pageErrorHandler = error => errors.push(error.message);
      p.on('console', consoleHandler);
      p.on('pageerror', pageErrorHandler);
      const response = await p.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 15000 });
      assert.ok(response?.ok(), route + ' returned ' + (response?.status() ?? 'no response') + ' at ' + width + 'px');
      const result = await p.evaluate(() => ({
        lang: document.documentElement.lang,
        title: document.title,
        h1: document.querySelectorAll('h1').length,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        badImages: [...document.images].filter(img => { const r = img.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !img.alt; }).length,
        unlabeled: [...document.querySelectorAll('input,select,textarea')].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') &&
            !(el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) && !el.closest('label');
        }).length,
        emptyControls: [...document.querySelectorAll('button,a,[role="button"]')].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !(el.textContent || '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title');
        }).length,
      }));
      assert.ok(result.lang && result.title && result.h1 === 1, route + ' metadata/heading contract failed');
      assert.equal(result.overflow, false, route + ' horizontally overflows at ' + width + 'px');
      assert.equal(result.badImages, 0, route + ' has visible images without alt text');
      assert.equal(result.unlabeled, 0, route + ' has unlabeled form controls');
      assert.equal(result.emptyControls, 0, route + ' has inaccessible empty controls');
      assert.equal(errors.length, 0, route + ' produced browser errors: ' + errors.join(' | '));
      p.off('console', consoleHandler);
      p.off('pageerror', pageErrorHandler);
      await p.close();
    }
  }
  const p = await context.newPage();
  const response = await p.goto(base + '/index-v86.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  assert.ok(response?.ok(), 'v86 page must load');
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'v86 UI must not horizontally overflow on mobile');
  assert.equal(await p.locator('#v86-controls').count(), 1);
  await p.keyboard.press('Tab');
  assert.ok(await p.locator(':focus').count() > 0, 'keyboard Tab must reach a focusable control');
  const homeCss = await p.request.get(base + '/home.css');
  assert.ok(homeCss.ok(), 'homepage CSS must be a real production asset');
  const progressResponse = await p.request.get(base + '/progress/');
  assert.ok(progressResponse.ok(), 'progress page must load');
  const progressCss = await p.request.get(base + '/progress/progress.css');
  assert.ok(progressCss.ok(), 'progress CSS must load directly');
  const careerResponse = await p.request.get(base + '/linux-careers/');
  assert.ok(careerResponse.ok(), 'career page must load');
} finally {
  await context.close();
  await browser.close();
  if (preview) preview.kill('SIGTERM');
}
assert.match(page, /Developer Alpine/);
assert.match(developerPage, /Developer Alpine/);
console.log('Three-ISO artifact/profile contracts and responsive keyboard/mobile UI checks passed');
