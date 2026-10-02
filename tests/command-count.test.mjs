import { readFile } from "node:fs/promises";

const MIN_COMMANDS = 6000;
const index = JSON.parse(await readFile("data/commands/index.json", "utf8"));
const canonical = JSON.parse(await readFile("data/commands/canonical.json", "utf8"));

const count = Number(index.target?.currentEntries);
const unique = Number(index.target?.uniqueEntries);
const canonicalCount = Number(canonical.recordCount ?? canonical.records?.length);

if (!Number.isInteger(count) || count < MIN_COMMANDS) throw new Error(`Command catalog has ${count} entries; expected at least ${MIN_COMMANDS}`);
if (!Number.isInteger(unique) || unique < MIN_COMMANDS) throw new Error(`Command catalog has ${unique} unique entries; expected at least ${MIN_COMMANDS}`);
if (!Number.isInteger(canonicalCount) || canonicalCount < MIN_COMMANDS) throw new Error(`Canonical command catalog has ${canonicalCount} entries; expected at least ${MIN_COMMANDS}`);
if (index.records?.length !== count) throw new Error(`Command index target says ${count} entries but contains ${index.records?.length ?? 0} records`);
if (canonical.records?.length !== canonicalCount) throw new Error(`Canonical target says ${canonicalCount} entries but contains ${canonical.records?.length ?? 0} records`);

console.log(`6000+ command verification passed: ${count} indexed / ${unique} unique / ${canonicalCount} canonical`);
