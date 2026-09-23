import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const scriptOrigin = (process.env.CLOUDFLARE_INSIGHTS_SCRIPT_ORIGIN || '').trim();
const connectOrigin = (process.env.CLOUDFLARE_INSIGHTS_CONNECT_ORIGIN || '').trim();

async function analyticsHashes() {
  const hashes = new Set();
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await walk(file);
      else if (entry.name.endsWith('.html')) {
        const html = await readFile(file, 'utf8');
        for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
          const body = match[1].trim();
          if (body) hashes.add(`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
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
  try { url = new URL(value); } catch { throw new Error(`${name} must be a valid absolute URL`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be an HTTPS origin`);
  }
  return url.origin;
}

const scriptHost = origin(scriptOrigin, 'CLOUDFLARE_INSIGHTS_SCRIPT_ORIGIN');
const connectHost = origin(connectOrigin, 'CLOUDFLARE_INSIGHTS_CONNECT_ORIGIN');
const scriptSrc = ["'self'", "'wasm-unsafe-eval'", ...(await analyticsHashes()), 'https://netlify-rum.netlify.app', scriptHost].filter(Boolean).join(' ');
const connectSrc = ["'self'", 'https://linuxterminal.me', 'https://www.linuxterminal.me', 'https://linuxterminal-iso.dshyleshkarthik7.workers.dev', 'https://huggingface.co', 'https://github.com', connectHost].filter(Boolean).join(' ');

const security = `Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
Permissions-Policy: camera=(), microphone=(), geolocation=()`;

const commonCsp = `default-src 'self'; script-src ${scriptSrc}; style-src 'self'; connect-src ${connectSrc}; img-src 'self' data:; font-src 'self' data:; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; report-uri /api/csp-report; report-to csp-endpoint`;
const loginCsp = `default-src 'self'; script-src 'self' https://identity.netlify.com https://netlify-rum.netlify.app; style-src 'self' 'unsafe-inline'; connect-src 'self' https://identity.netlify.com; img-src 'self' data: https://identity.netlify.com; frame-src 'self' https://identity.netlify.com; font-src 'self' data:; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; report-uri /api/csp-report; report-to csp-endpoint`;
const beginnerCsp = `default-src 'self'; script-src 'self' https://identity.netlify.com; style-src 'self'; connect-src 'self' https://identity.netlify.com; img-src 'self' data: https://identity.netlify.com; font-src 'self' data:; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; report-uri /api/csp-report; report-to csp-endpoint`;
const vmCsp = `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; connect-src ${connectSrc}; img-src 'self' data:; font-src 'self'; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; report-uri /api/csp-report; report-to csp-endpoint`;

await mkdir('dist', { recursive: true });
const headerBlock = (csp) => `${security}
Content-Security-Policy: ${csp}
Reporting-Endpoints: csp-endpoint="/api/csp-report"`;

await writeFile('dist/_headers', `/*
  ${headerBlock(commonCsp)}

  /login/*
  ${headerBlock(loginCsp)}

  /beginner/*
  ${headerBlock(beginnerCsp)}

  /real-linux/*
  ${headerBlock(vmCsp)}

  /developer-alpine/*
  ${headerBlock(vmCsp)}
`);
console.log('[LinuxLab] Generated deploy security headers with separate HTTP headers and CSP directives.');
