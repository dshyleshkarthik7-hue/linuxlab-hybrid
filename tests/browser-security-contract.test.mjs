import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
const main=readFileSync('src/main-v86.ts','utf8');
const headers=readFileSync('netlify.toml','utf8');
const progress=readFileSync('progress/progress.js','utf8');
assert.doesNotMatch(main,/innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML\s*\(/);
assert.match(main,/replaceChildren\(document\.createTextNode\(text\)\)/);
assert.match(headers,/Cross-Origin-Opener-Policy\s*=\s*"same-origin"/);
assert.match(headers,/Cross-Origin-Embedder-Policy\s*=\s*"credentialless"/);
assert.match(headers,/script-src[^\n]*https:\/\/static\.cloudflareinsights\.com/);
assert.match(headers,/style-src[^\n]*'unsafe-inline'/);
assert.match(headers,/connect-src[^\n]*https:\/\/cloudflareinsights\.com/);
assert.match(headers,/Permissions-Policy\s*=\s*"[^"]*camera=\(\)/);
assert.match(progress,/^import ['"]\/progress\.js['"];?$/m);
console.log('Browser security regression contract checks passed');

const v86=readFileSync('src/main-v86.ts','utf8'); assert.match(v86,/net_device:\s*\{ type: 'none' \}/); assert.match(v86,/visibilitychange/); assert.match(v86,/destroy\?\./); console.log('VM lifecycle/network regression contract passed');

const mainV86=readFileSync('src/main-v86.ts','utf8');
assert.match(mainV86,/verified artifact \$\{artifact\.version\}/);
assert.match(mainV86,/Verified Alpine artifact identity was not established/);
console.log('Verified-artifact readiness contract passed');
