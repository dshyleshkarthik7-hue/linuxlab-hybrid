import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const scriptOrigin = (process.env.CLOUDFLARE_INSIGHTS_SCRIPT_ORIGIN || '').trim();
const connectOrigin = (process.env.CLOUDFLARE_INSIGHTS_CONNECT_ORIGIN || '').trim();
const MAX_HEADER_LINE_BYTES = 8192;

async function analyticsHashes() {
  const hashes = new Set();
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = dir + '/' + entry.name;
      if (entry.isDirectory()) await walk(file);
      else if (entry.name.endsWith('.html')) {
        const html = await readFile(file, 'utf8');
        for (const match of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
          const attrs = match[1] || '';
          const typeMatch = attrs.match(/\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
          const type = (typeMatch?.[1] ?? typeMatch?.[2] ?? typeMatch?.[3] ?? '').trim().toLowerCase();
          // CSP hashes authorize executable inline scripts, not data blocks such as JSON-LD.
          if (type && !['module', 'text/javascript', 'application/javascript', 'application/ecmascript', 'text/ecmascript'].includes(type)) continue;
          const body = match[2];
          if (body.trim()) hashes.add("'sha256-" + createHash('sha256').update(body).digest('base64') + "'");
        }
      }
    }
  }
  await walk('dist');
  return [...hashes];
}

function origin(value, name) {
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new Error(name + ' must be a valid absolute URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(name + ' must be an HTTPS origin');
  }
  return url.origin;
}

const scriptHost = origin(scriptOrigin, 'CLOUDFLARE_INSIGHTS_SCRIPT_ORIGIN');
const connectHost = origin(connectOrigin, 'CLOUDFLARE_INSIGHTS_CONNECT_ORIGIN');
const hashes = await analyticsHashes();
const scriptSrc = ["'self'", "'wasm-unsafe-eval'", "'sha256-Ob/z7smzKJGFdMGHiYHvik0pzOqdUCQ9Qa2zSrkvshs='", ...hashes, 'https://netlify-rum.netlify.app', scriptHost].filter(Boolean).join(' ');
const connectSrc = ["'self'", 'https://linuxterminal.me', 'https://www.linuxterminal.me', 'https://linuxterminal-iso.dshyleshkarthik7.workers.dev', 'https://huggingface.co', 'https://*.hf.co', 'https://*.xethub.hf.co', 'https://github.com', 'https://release-assets.githubusercontent.com', 'https://objects.githubusercontent.com', 'https://*.amazonaws.com', connectHost].filter(Boolean).join(' ');

const security = [
  'Strict-Transport-Security: max-age=31536000; includeSubDomains',
  'X-Content-Type-Options: nosniff',
  'Cross-Origin-Resource-Policy: same-origin',
  'Referrer-Policy: strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy: same-origin',
  'Cross-Origin-Embedder-Policy: credentialless',
  'Permissions-Policy: camera=(), microphone=(), geolocation=()'
].join('\n');

const commonCsp = "default-src 'self'; script-src " + scriptSrc + "; style-src 'self'; connect-src " + connectSrc + "; img-src 'self' data:; font-src 'self' data:; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; report-uri /api/csp-report; report-to csp-endpoint";
const loginCsp = "default-src 'self'; script-src 'self' https://identity.netlify.com https://netlify-rum.netlify.app; style-src 'self' 'unsafe-inline'; connect-src 'self' https://identity.netlify.com; img-src 'self' data: https://identity.netlify.com; frame-src 'self' https://identity.netlify.com; font-src 'self' data:; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; report-uri /api/csp-report; report-to csp-endpoint";
const beginnerCsp = "default-src 'self'; script-src 'self' https://identity.netlify.com; style-src 'self'; connect-src 'self' https://identity.netlify.com; img-src 'self' data: https://identity.netlify.com; font-src 'self' data:; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; report-uri /api/csp-report; report-to csp-endpoint";
const vmCsp = "default-src 'self'; script-src " + scriptSrc + "; style-src 'self' 'unsafe-inline'; connect-src " + connectSrc + "; img-src 'self' data:; font-src 'self'; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; report-uri /api/csp-report; report-to csp-endpoint";

await mkdir('dist', { recursive: true });
const htmlCache = 'CDN-Cache-Control: public, max-age=3600, stale-while-revalidate=86400';
const assetCache = 'CDN-Cache-Control: public, max-age=86400, stale-while-revalidate=604800';
const headerBlock = (csp) => [security, 'Content-Security-Policy: ' + csp, 'Reporting-Endpoints: csp-endpoint="/api/csp-report"', htmlCache].join('\n');
const indentHeaders = (block) => block.split('\n').map((line) => '  ' + line).join('\n');

const headers = [
  '/*',
  indentHeaders(headerBlock(commonCsp)),
  '',
  '/login/*',
  indentHeaders(headerBlock(loginCsp)),
  '',
  '/beginner/*',
  indentHeaders(headerBlock(beginnerCsp)),
  '',
  '/real-linux/*',
  indentHeaders(headerBlock(vmCsp)),
  '',
  '/developer-alpine/*',
  indentHeaders(headerBlock(vmCsp)),
  '',
  '/index-v86.html',
  indentHeaders(headerBlock(vmCsp)),
  '',
  '/developer-alpine/index.html',
  indentHeaders(headerBlock(vmCsp)),
  '',
  '/*.css',
  '  ' + assetCache,
  '',
  '/*.js',
  '  ' + assetCache,
  '',
  '/*.svg',
  '  ' + assetCache,
  ''
].join('\n');

const oversizedLines = headers.split('\n').map((line) => Buffer.byteLength(line, 'utf8')).filter((bytes) => bytes > MAX_HEADER_LINE_BYTES);
if (oversizedLines.length) throw new Error('Generated _headers contains a line exceeding ' + MAX_HEADER_LINE_BYTES + ' bytes');
await writeFile('dist/_headers', headers);
console.log('[LinuxLab] Generated deploy security headers with ' + hashes.length + ' executable inline-script hashes.');
