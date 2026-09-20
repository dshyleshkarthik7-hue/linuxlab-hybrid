import { mkdir, writeFile } from 'node:fs/promises';

const scriptOrigin = (process.env.CLOUDFLARE_INSIGHTS_SCRIPT_ORIGIN || '').trim();
const connectOrigin = (process.env.CLOUDFLARE_INSIGHTS_CONNECT_ORIGIN || '').trim();

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
const scriptSrc = ["'self'", "'wasm-unsafe-eval'", 'https://netlify-rum.netlify.app', scriptHost].filter(Boolean).join(' ');
const connectSrc = ["'self'", 'https://linuxterminal.me', 'https://www.linuxterminal.me', 'https://linuxterminal-iso.dshyleshkarthik7.workers.dev', connectHost].filter(Boolean).join(' ');

const common = `default-src 'self'; script-src ${scriptSrc}; style-src 'self'; connect-src ${connectSrc}; img-src 'self' data:; font-src 'self' data:; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; report-uri /api/csp-report`;
const login = `default-src 'self'; script-src 'self' https://identity.netlify.com https://netlify-rum.netlify.app; style-src 'self'; connect-src 'self' https://identity.netlify.com; img-src 'self' data: https://identity.netlify.com; font-src 'self' data:; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; report-uri /api/csp-report`;
const beginner = `default-src 'self'; script-src 'self' https://identity.netlify.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://identity.netlify.com; img-src 'self' data: https://identity.netlify.com; font-src 'self' data:; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; report-uri /api/csp-report`;
const vm = `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; connect-src ${connectSrc}; img-src 'self' data:; font-src 'self' data:; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; report-uri /api/csp-report`;
const developer = `default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; connect-src ${connectSrc}; img-src 'self' data:; font-src 'self'; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; report-uri /api/csp-report`;

await mkdir('dist', { recursive: true });
await writeFile('dist/_headers', `/*\n  Content-Security-Policy: ${common}\n\n/login/*\n  Content-Security-Policy: ${login}\n\n/beginner/*\n  Content-Security-Policy: ${beginner}\n\n/real-linux/*\n  Content-Security-Policy: ${vm}\n\n/developer-alpine/*\n  Content-Security-Policy: ${developer}\n`);
console.log('[LinuxLab] Generated deploy CSP headers from Netlify build environment.');
