import { strict as assert } from 'node:assert';

const baseURL = process.env.PRODUCTION_BASE_URL || process.argv[2];
if (!baseURL) throw new Error('PRODUCTION_BASE_URL is required for post-deployment verification');
const origin = baseURL.replace(/\/$/, '');
const timeoutMs = Number(process.env.PRODUCTION_SMOKE_TIMEOUT_MS || 60000);
const fetchWithTimeout = (url) => fetch(url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });

const routes = [
  '/index.html',
  '/beginner/',
  '/commands/',
  '/commands/pwd/',
  '/quiz/',
  '/challenges/',
  '/about/',
  '/contact/',
  '/login/',
  '/simulator.html',
  '/index-v86.html',
  '/robots.txt',
  '/sitemap.xml',
];

for (const path of routes) {
  const response = await fetchWithTimeout(origin + path);
  assert.equal(response.ok, true, `${path} returned ${response.status}`);
}

for (const asset of ['/src/beginner.css', '/quiz/quiz.css', '/src/v86-layout.css']) {
  const response = await fetchWithTimeout(origin + asset);
  assert.equal(response.ok, true, `${asset} returned ${response.status}`);
  assert.match(response.headers.get('content-type') || '', /css/i, `${asset} must be served as CSS`);
}

const homepage = await (await fetchWithTimeout(origin + '/index.html')).text();
assert.match(homepage, /LinuxTerminal|LinuxLab/i);
assert.doesNotMatch(homepage, /<script(?![^>]+src=)[^>]*>/i, 'production homepage must not contain inline scripts');

const quiz = await (await fetchWithTimeout(origin + '/quiz/')).text();
assert.doesNotMatch(quiz, /<style[\s>]/i, 'production quiz must not contain inline styles');
assert.doesNotMatch(quiz, /<script(?![^>]+src=)[^>]*>/i, 'production quiz must not contain inline scripts');
assert.match(quiz, /500 Linux quiz questions/i);

const login = await (await fetchWithTimeout(origin + '/login/')).text();
assert.match(login, /Netlify Identity|Sign in/i);

console.log('Production deployment smoke checks passed');
