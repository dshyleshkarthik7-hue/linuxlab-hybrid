import { strict as assert } from 'node:assert';
import { ExecutableCommandCatalog, P1Runtime } from '../src/product/P1Runtime.ts';

const catalog = new ExecutableCommandCatalog();
const runtime = new P1Runtime();
assert.ok(catalog.size > 0);
for (const name of catalog.commands) {
  assert.equal(catalog.has(name), true, `${name} must be executable`);
  const result = await runtime.engine.executeResult(name);
  assert.notEqual(result.exitCode, 127, `${name} is catalogued as executable but returned command-not-found`);
}
console.log(`Executable catalog behavior checks passed (${catalog.size} commands)`);
