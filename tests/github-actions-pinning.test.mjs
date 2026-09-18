import { strict as assert } from 'node:assert'; import { readFileSync } from 'node:fs';
const w=readFileSync('.github/workflows/ci.yml','utf8'); for(const line of w.split('\n').filter(x=>x.trim().startsWith('- uses:'))){const ref=line.match(/uses:\s+[^@]+@([^\s#]+)/)?.[1];assert.ok(ref&&/^[0-9a-f]{40}$/i.test(ref),`GitHub Action must use immutable SHA: ${line.trim()}`);}
console.log('GitHub Actions immutable SHA policy passed');
