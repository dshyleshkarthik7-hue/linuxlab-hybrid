import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const scriptOrigin = (process.env.CLOUDFLARE_INSIGHTS_SCRIPT_ORIGIN || '').trim();
const connectOrigin = (process.env.CLOUDFLARE_INSIGHTS_CONNECT_ORIGIN || '').trim();
const isoWorkerOrigin = (process.env.ISO_WORKER_ORIGIN || 'https://linuxterminal-iso.dshyleshkarthik7.workers.dev').trim();
const MAX_HEADER_LINE_BYTES = 8192;

function origin(value, name) {
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new Error(name + ' must be a valid absolute URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(name + ' must be an HTTPS origin');
  }
  return url.origin;
}

function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const match of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const attrs = match[1] || '';
    const typeMatch = attrs.match(/\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const type = (typeMatch?.[1] ?? typeMatch?.[2] ?? typeMatch?.[3] ?? '').trim().toLowerCase();
    if (type && !['module', 'text/javascript', 'application/javascript', 'application/ecmascript', 'text/ecmascript'].includes(type)) continue;
    const body = match[2];
    if (body.trim()) hashes.add("'sha256-" + createHash('sha256').update(body).digest('base64') + "'");
  }
  return [...hashes];
}

async function listHtmlFiles(dir = 'dist', prefix = '') {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    const absolute = dir + '/' + entry.name;
    if (entry.isDirectory()) files.push(...await listHtmlFiles(absolute, relative));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push({ relative, absolute });
  }
  return files;
}

const scriptHost = origin(scriptOrigin, 'CLOUDFLARE_INSIGHTS_SCRIPT_ORIGIN');
const connectHost = origin(connectOrigin, 'CLOUDFLARE_INSIGHTS_CONNECT_ORIGIN');
const workerOrigin = origin(isoWorkerOrigin, 'ISO_WORKER_ORIGIN');
if (!workerOrigin) throw new Error('ISO_WORKER_ORIGIN must be configured');

const security = [
  'Strict-Transport-Security: max-age=31536000; includeSubDomains',
  'X-Content-Type-Options: nosniff',
  'Cross-Origin-Resource-Policy: same-origin',
  'Referrer-Policy: strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy: same-origin',
  'Cross-Origin-Embedder-Policy: credentialless',
  'Permissions-Policy: camera=(), microphone=(), geolocation=()'
].join('\n');

const connectSrc = ["'self'", 'https://linuxterminal.me', 'https://www.linuxterminal.me', workerOrigin, 'https://huggingface.co', 'https://*.hf.co', 'https://*.xethub.hf.co', 'https://github.com', 'https://release-assets.githubusercontent.com', 'https://objects.githubusercontent.com', connectHost].filter(Boolean).join(' ');
const policy = (html, kind) => {
  const scriptSrc = ["'self'", ...(kind === 'vm' ? ["'wasm-unsafe-eval'"] : []), ...inlineScriptHashes(html), 'https://netlify-rum.netlify.app', scriptHost].filter(Boolean).join(' ');
  if (kind === 'login') return "default-src 'self'; script-src " + scriptSrc + " https://identity.netlify.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://identity.netlify.com; img-src 'self' data: https://identity.netlify.com; frame-src 'self' https://identity.netlify.com; font-src 'self' data:; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; report-uri /api/csp-report; report-to csp-endpoint";
  if (kind === 'beginner') return "default-src 'self'; script-src " + scriptSrc + " https://identity.netlify.com; style-src 'self'; connect-src " + connectSrc + " https://identity.netlify.com; img-src 'self' data: https://identity.netlify.com; font-src 'self' data:; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; report-uri /api/csp-report; report-to csp-endpoint";
  const styles = kind === 'vm' ? "'self' 'unsafe-inline'" : "'self'";
  return "default-src 'self'; script-src " + scriptSrc + "; style-src " + styles + "; connect-src " + connectSrc + "; img-src 'self' data:; font-src 'self' data:; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; report-uri /api/csp-report; report-to csp-endpoint";
};

await mkdir('dist', { recursive: true });
const htmlCache = 'CDN-Cache-Control: public, max-age=3600, stale-while-revalidate=86400';
const assetCache = 'CDN-Cache-Control: public, max-age=86400, stale-while-revalidate=604800';
const indent = (block) => block.split('\n').map((line) => '  ' + line).join('\n');
const htmlEntries = await listHtmlFiles();
const htmlCacheMap = new Map(await Promise.all(htmlEntries.map(async ({ absolute }) => [absolute, await readFile(absolute, 'utf8')])));
const headers = [
  '/*',
  indent(security + '\nReporting-Endpoints: csp-endpoint="/api/csp-report"'),
  '',
  ...htmlEntries.flatMap(({ relative, absolute }) => {
    const html = htmlCacheMap.get(absolute);
    const normalized = relative.replace(/\\/g, '/');
    const kind = /(^|\/)login\//.test(normalized) ? 'login'
      : /(^|\/)beginner\//.test(normalized) ? 'beginner'
      : /(^|\/)(real-linux|developer-alpine)\//.test(normalized) || /(^|\/)(index-v86|linux4|simulator)\.html$/.test(normalized) ? 'vm'
      : 'common';
    return ['/' + normalized, indent('Content-Security-Policy: ' + policy(html, kind) + '\n' + htmlCache), ''];
  }),
  '/*.css', '  ' + assetCache, '',
  '/*.js', '  ' + assetCache, '',
  '/*.svg', '  ' + assetCache, '',
  '/*.bin', '  Cache-Control: public, max-age=31536000, immutable\n  CDN-Cache-Control: public, max-age=31536000, immutable', ''
].join('\n');

const oversizedLines = headers.split('\n').map((line) => Buffer.byteLength(line, 'utf8')).filter((bytes) => bytes > MAX_HEADER_LINE_BYTES);
if (oversizedLines.length) throw new Error('Generated _headers contains a line exceeding ' + MAX_HEADER_LINE_BYTES + ' bytes');
await writeFile('dist/_headers', headers);
console.log('[LinuxLab] Generated deploy security headers for ' + htmlEntries.length + ' HTML pages; wasm eval is limited to VM pages.');
