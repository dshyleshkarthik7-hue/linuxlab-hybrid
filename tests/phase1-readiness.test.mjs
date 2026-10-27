import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
assert.match(pkg.scripts["phase1:check"], /phase1-readiness/);
const threat = await readFile(new URL("../THREAT_MODEL.md", import.meta.url), "utf8");
assert.match(threat, /not a host-kernel security boundary/i);
const ci = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
assert.match(ci, /name: Phase 1 repository readiness baseline[\s\S]*?run: npm run phase1:check/);
const report = execFileSync(process.execPath, ["scripts/phase1-readiness.mjs"], { encoding: "utf8" });
const result = JSON.parse(report);
assert.equal(result.result, "PASS");
assert.ok(result.commands.total >= 6000);
assert.ok(result.curriculum.total > 0);
assert.ok(result.artifacts > 0);
console.log("Phase 1 readiness contract tests passed.");
