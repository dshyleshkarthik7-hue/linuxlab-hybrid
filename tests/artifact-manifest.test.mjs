import { strict as assert } from 'node:assert'; import { readFileSync } from 'node:fs';
const m=JSON.parse(readFileSync('artifacts/manifest.json','utf8')); assert.equal(m.schemaVersion,1); assert.ok(Array.isArray(m.artifacts)&&m.artifacts.length>=5);
for(const a of m.artifacts){assert.match(a.sha256,/^[a-f0-9]{64}$/i);assert.ok(Number.isSafeInteger(a.size)&&a.size>0);assert.match(a.release,/^[A-Za-z0-9._-]+$/);}
console.log('Artifact provenance manifest contract passed');
