import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/production-smoke.yml', import.meta.url), 'utf8');
const smoke = await readFile(new URL('./production-smoke.mjs', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(workflow, /EXPECTED_DEPLOY_SHA:\s*\$\{\{\s*inputs\.expected_deploy_sha\s*\|\|\s*github\.sha\s*\}\}/,
  'scheduled and manual production smoke must verify commit provenance by default');
assert.match(smoke, /build-info\.json/, 'production smoke must check deployed build metadata');
assert.match(smoke, /chunkManifestResponse/, 'production smoke must fetch the live Developer Alpine chunk manifest');
assert.match(smoke, /live chunk manifest must pin the trusted release digest/);
assert.match(smoke, /real SHA-256 digest/, 'production smoke must reject placeholder chunk hashes');
assert.match(smoke, /live Developer Alpine chunk manifest must cover the complete release asset/);
assert.match(smoke, /cache-isolation probe/, 'production smoke must verify origin cache isolation');
assert.match(smoke, /content-security-policy/, 'production smoke must verify CSP');
assert.equal(pkg.scripts['test:ci'].includes('npm run test:production-monitor-contract'), true,
  'production monitor contract must block CI when provenance/integrity checks regress');

console.log('Production monitor contract passed');
