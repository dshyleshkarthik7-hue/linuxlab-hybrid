import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(process.cwd(), 'dist');
assert.ok(existsSync(root), 'dist/ must exist before deployment output verification');

const commands = ['pwd','ls','cd','mkdir','cat','cp','mv','rm','grep','find','sed','awk','chmod','chown','ps','top','df','du','tar','curl','ssh','ip','ping','git','head','tail'];
for (const command of commands) {
  const file = join(root, 'commands', `${command}.html`);
  assert.ok(existsSync(file), `Built dist is missing /commands/${command}.html`);
  const page = readFileSync(file, 'utf8');
  assert.match(page, new RegExp(`rel=\\"canonical\\" href=\\"https://linuxterminal\\.me/commands/${command}\\.html\\"`), `Built canonical is wrong: ${command}`);
}

for (const file of ['commands-entry.html','commands.css','commands.js','beginner/index.html']) {
  assert.ok(existsSync(join(root, file)), `Built dist is missing ${file}`);
}
const catalog = readFileSync(join(root, 'commands.js'), 'utf8');
assert.equal([...catalog.matchAll(/\['[^']+','[^']+'\]/g)].length, 200, 'Built command catalogue must contain exactly 200 entries');
const beginner = readFileSync(join(root, 'beginner/index.html'), 'utf8');
assert.match(beginner, /200 Linux Commands/i, 'Built beginner page must retain the 200-command catalogue');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const htmlFiles = walk(root).filter(file => file.endsWith('.html'));
assert.ok(htmlFiles.length >= 35, `Expected the generated site to contain all HTML pages; found ${htmlFiles.length}`);

const routeAliases = new Map([
  ['/commands', 'commands-entry.html'], ['/commands/', 'commands-entry.html'],
  ['/learn', 'learn/index.html'], ['/learn/', 'learn/index.html'],
  ['/progress', 'progress/index.html'], ['/progress/', 'progress/index.html'],
  ['/tutorials', 'learn/index.html'], ['/tutorials/', 'learn/index.html'],
  ['/real-linux/', 'index-v86.html'], ['/simulator/', 'simulator.html']
]);
function publicPathToFile(pathname) {
  const clean = decodeURIComponent(pathname.split(/[?#]/, 1)[0]);
  if (!clean.startsWith('/')) return null;
  const relativePath = routeAliases.get(clean) || (clean === '/' ? 'index.html' : clean.endsWith('/') ? `${clean.slice(1)}index.html` : clean.slice(1));
  const file = join(root, relativePath);
  return file.startsWith(root) ? file : null;
}
function localFileForReference(value, pagePath) {
  if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|data:|blob:|#)/i.test(value)) return null;
  const resolved = new URL(value, `https://linuxterminal.me/${pagePath.replace(/^\//,'')}`).href;
  const url = new URL(resolved);
  if (url.origin !== 'https://linuxterminal.me') return null;
  return publicPathToFile(url.pathname);
}

for (const file of htmlFiles) {
  const page = readFileSync(file, 'utf8');
  const publicPath = `/${relative(root, file).replaceAll('\\','/')}`;
  const is404 = publicPath === '/404.html';
  if (!is404) {
    assert.match(page, /<title>[^<]{3,200}<\/title>/i, `${publicPath} must have a title`);
    // Accept both quoted HTML attribute styles without rejecting apostrophes inside
    // a double-quoted description such as "the shell's current directory".
    assert.match(page, /<meta[^>]+name=["']description["'][^>]+content=(?:"[^"]{20,320}"|'[^']{20,320}')/i, `${publicPath} must have a useful meta description`);
    const canonical = page.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1];
    assert.ok(canonical, `${publicPath} must have a canonical URL`);
    assert.equal(new URL(canonical).origin, 'https://linuxterminal.me', `${publicPath} canonical must use production HTTPS`);
  }

  for (const src of [...page.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(x => x[1])) {
    const localFile = localFileForReference(src, publicPath);
    if (localFile) assert.ok(existsSync(localFile), `${publicPath} references missing JS asset ${src}`);
  }
  for (const href of [...page.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["']/gi)].map(x => x[1])) {
    if (!/\.css(?:$|[?#])/i.test(href)) continue;
    const localFile = localFileForReference(href, publicPath);
    if (localFile) assert.ok(existsSync(localFile), `${publicPath} references missing CSS asset ${href}`);
  }
  for (const href of [...page.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)].map(x => x[1])) {
    const localFile = localFileForReference(href, publicPath);
    if (localFile) assert.ok(existsSync(localFile), `${publicPath} links to missing internal page ${href}`);
  }
}

console.log(`dist routes: ${htmlFiles.length} generated HTML pages crawled; ${commands.length} dedicated command lessons + 200-command catalogue + referenced JS/CSS/assets verified`);
