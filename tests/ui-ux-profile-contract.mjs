import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const read = path => readFile(path, 'utf8');
const artifacts = await read('src/core/artifacts.ts');
const policy = await read('src/engine/VMResourcePolicy.ts');
const runtime = await read('src/main-v86.ts');
const page = await read('index-v86.html');
const developerPage = await read('developer-alpine/index.html');

const profiles = [
  ['developer','DEVELOPER_ALPINE_ARTIFACT',691011584,1024],
  ['virt','ALPINE_ARTIFACT',51380224,256],
  ['linux4','LINUX4_ARTIFACT',7731200,256],
];
for (const [id, artifact, size, memory] of profiles) {
  assert.match(artifacts, new RegExp('export const ' + artifact + ': PinnedArtifact'));
  assert.match(artifacts, new RegExp('size: ' + size));
  assert.match(policy, new RegExp(id + ': \\{ memoryMiB: ' + memory));
}
assert.match(runtime, /Developer Alpine v1\.0\.0/);
assert.match(runtime, /Alpine Virt 3\.24\.1/);
assert.match(page, /data-v86-profile="virt"/);
assert.match(developerPage, /data-v86-profile="developer"/);
for (const source of [page, developerPage]) {
  assert.match(source, /id="v86-terminal-container"/);
  assert.match(source, /id="screen_container"/);
  assert.match(source, /btn-v86-terminal/);
  assert.match(source, /btn-v86-screen/);
  assert.match(source, /btn-v86-restart/);
  assert.match(source, /aria-label=/);
}
assert.match(runtime, /keyboard_send_text/);
assert.match(runtime, /keyboard_set_enabled/);
assert.match(runtime, /handleResize/);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p = await context.newPage();
try {
  const base = process.env.UI_UX_BASE_URL || 'http://127.0.0.1:4173';
  const response = await p.goto(base + '/index-v86.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  assert.ok(response?.ok(), 'v86 page must load');
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'v86 UI must not horizontally overflow on mobile');
  assert.equal(await p.locator('#v86-controls').count(), 1);
  await p.keyboard.press('Tab');
  assert.ok(await p.locator(':focus').count() > 0, 'keyboard Tab must reach a focusable control');
} finally { await context.close(); await browser.close(); }
console.log('Three-ISO artifact/profile contracts and keyboard/mobile UI checks passed');
