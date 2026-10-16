import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';

for (const file of readdirSync('.github/workflows').filter((name) => /\.(yml|yaml)$/.test(name))) {
  const workflow = readFileSync(`.github/workflows/${file}`, 'utf8');
  for (const line of workflow.split('\n').filter((x) => x.trim().startsWith('- uses:'))) {
    const ref = line.match(/uses:\s+[^@]+@([^\s#]+)/)?.[1];
    assert.ok(ref && /^[0-9a-f]{40}$/i.test(ref), `GitHub Action must use immutable SHA in ${file}: ${line.trim()}`);
  }
}

const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const topLevelPermissions = ci.match(/^permissions:\n([\s\S]*?)(?=^jobs:)/m)?.[1] || '';
assert.match(topLevelPermissions, /^\s+contents:\s*read\s*$/m, 'workflow-level permissions must be read-only');
assert.doesNotMatch(topLevelPermissions, /id-token:\s*write|attestations:\s*write|contents:\s*write/, 'workflow-level permissions must not grant publishing or OIDC capabilities');
const verifyJob = ci.match(/^  verify:\n([\s\S]*?)(?=^  attest:|\Z)/m)?.[1] || '';
assert.match(verifyJob, /^    permissions:\n      contents:\s*read\s*$/m, 'untrusted verification job must have explicit read-only permissions');
assert.doesNotMatch(verifyJob, /id-token:\s*write|attestations:\s*write/, 'verification must not mint OIDC tokens or attestations');
const attestJob = ci.match(/^  attest:\n([\s\S]*)$/m)?.[1] || '';
assert.match(attestJob, /^    if:\s*github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'$/m, 'provenance must only run for pushes to main');
assert.match(attestJob, /id-token:\s*write/);
assert.match(attestJob, /attestations:\s*write/);
assert.match(attestJob, /needs:\s*verify/);

console.log('GitHub Actions immutable SHA and least-privilege permission policies passed');
