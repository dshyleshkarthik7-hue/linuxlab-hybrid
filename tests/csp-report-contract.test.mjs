import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../netlify/edge-functions/csp-report.ts', import.meta.url), 'utf8');

assert.match(source, /function sanitizeReport\(parsed: CspReport\)/);
assert.match(source, /MAX_LOG_FIELD_BYTES = 512/);
assert.match(source, /replace\(\/\[\\u0000-\\u001f\\u007f\]\/g, ' '\)/);
assert.match(source, /JSON\.stringify\(sanitizeReport\(parsed as CspReport\)\)/);
assert.doesNotMatch(source, /JSON\.stringify\(parsed\)\.slice\(0, MAX_REPORT_BYTES\)/);

console.log('CSP report logging contract checks passed');

// The limiter must fail closed for every unavailable or malformed dependency state.
assert.match(source, /if \(!identity\) return true;/);
assert.match(source, /if \(!UPSTASH_URL \|\| !UPSTASH_TOKEN\) return true;/);
assert.match(source, /if \(!response\.ok\) return true;/);
assert.match(source, /if \(typeof data !== 'object' \|\| data === null \|\| !\('result' in data\)\)/);
assert.match(source, /if \(typeof result !== 'number'\)/);
assert.match(source, /catch \{\s*return true;\s*\}/);
assert.match(source, /Origin Not Allowed/);

const headersGenerator = readFileSync(new URL('../scripts/generate-netlify-headers.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(headersGenerator, /https:\/\/\*\.amazonaws\.com/, 'CSP must not allow arbitrary AWS buckets');
assert.doesNotMatch(headersGenerator, /sha256-Ob\/z7smzKJGFdMGHiYHvik0pzOqdUCQ9Qa2zSrkvshs=/, 'unexplained static script hash must not be trusted');
assert.match(headersGenerator, /inlineScriptHashes\(html\)/, 'inline script hashes must be derived from the HTML being protected');
assert.match(headersGenerator, /kind === 'vm' \? \["'wasm-unsafe-eval'"\]/, 'WebAssembly evaluation must be limited to VM pages');
assert.match(headersGenerator, /htmlEntries\.flatMap/, 'CSP must be generated per exact HTML path to avoid overlapping policies');
assert.doesNotMatch(headersGenerator, /const commonCsp|const vmCsp|const loginCsp/, 'overlapping path-specific CSP variables must not be emitted alongside a global CSP');
