import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';

for (const file of readdirSync('.github/workflows').filter((name) => /\.(yml|yaml)$/.test(name))) {
  const workflow = readFileSync(`.github/workflows/${file}`, 'utf8');
  for (const line of workflow.split('\n').filter((x) => x.trim().startsWith('- uses:'))) {
    const ref = line.match(/uses:\s+[^@]+@([^\s#]+)/)?.[1];
    assert.ok(ref && /^[0-9a-f]{40}$/i.test(ref), `GitHub Action must use immutable SHA in ${file}: ${line.trim()}`);
  }
}
console.log('GitHub Actions immutable SHA policy passed');
