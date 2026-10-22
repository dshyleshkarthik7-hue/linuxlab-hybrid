import { readFile } from "node:fs/promises";

const EXPECTED_COMMANDS = 6161;
const EXPECTED_CURRICULUM = 200;
const index = JSON.parse(await readFile("data/commands/index.json", "utf8"));
const canonical = JSON.parse(await readFile("data/commands/canonical.json", "utf8"));
const publicIndex = JSON.parse(await readFile("public/command-index.json", "utf8"));

const count = Number(index.target?.currentEntries);
const unique = Number(index.target?.uniqueEntries);
const authored = Number(index.target?.authoredRecords);
const canonicalCount = Number(canonical.recordCount ?? canonical.records?.length);

if (count !== EXPECTED_COMMANDS) throw new Error(`Canonical inventory reports ${count} entries; expected ${EXPECTED_COMMANDS}`);
if (unique !== EXPECTED_COMMANDS) throw new Error(`Canonical inventory reports ${unique} unique entries; expected ${EXPECTED_COMMANDS}`);
if (canonicalCount !== EXPECTED_COMMANDS) throw new Error(`Canonical command catalog has ${canonicalCount} entries; expected ${EXPECTED_COMMANDS}`);
if (index.records?.length !== EXPECTED_CURRICULUM) throw new Error(`Beginner curriculum has ${index.records?.length ?? 0} records; expected ${EXPECTED_CURRICULUM}`);
if (authored !== EXPECTED_CURRICULUM) throw new Error(`Beginner curriculum target says ${authored} authored records; expected ${EXPECTED_CURRICULUM}`);
if (canonical.records?.length !== canonicalCount) throw new Error(`Canonical target says ${canonicalCount} entries but contains ${canonical.records?.length ?? 0} records`);
if (Number(index.target?.minimumEntries) < 6000) throw new Error(`Catalog minimum is ${index.target?.minimumEntries}; expected at least 6000`);
if (Number(canonical.uniqueRecordNames) !== canonicalCount) throw new Error(`Canonical unique name count ${canonical.uniqueRecordNames} does not match ${canonicalCount}`);
if (publicIndex.schemaVersion !== 2 || publicIndex.recordCount !== EXPECTED_COMMANDS || publicIndex.records?.length !== EXPECTED_COMMANDS) throw new Error("Published command index is stale or incomplete");
if (publicIndex.uniqueRecordNames !== EXPECTED_COMMANDS || new Set(publicIndex.records.map(record => String(record.name).trim().toLowerCase())).size !== EXPECTED_COMMANDS) throw new Error("Published command index has duplicate or missing names");
if (publicIndex.records.some(record => !record.name || !record.category || !record.url || (record.editorialStatus !== "pending-review" && !String(record.summary || "").trim()))) throw new Error("Published command index contains records missing required fields or falsely marked as reviewed");
if (!publicIndex.records.some(record => record.name === "sudo") || !publicIndex.records.some(record => record.name === "systemctl")) throw new Error("Published command index is missing representative commands");

const databaseScript = await readFile("scripts/commands/build-database.mjs", "utf8");
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
if (!packageJson.scripts.predev?.includes("build-database.mjs")) throw new Error("Development startup must regenerate the full command catalog");
if (!databaseScript.includes("public/command-index.json")) throw new Error("Canonical catalog generator must produce the public index");


console.log(`${EXPECTED_COMMANDS}-command verification passed; ${EXPECTED_CURRICULUM}-command beginner curriculum preserved`);
