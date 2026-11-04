#!/usr/bin/env node
/**
 * Evidence gate for command lessons.
 *
 * Research records live in data/commands/research/<canonical-command-name>.json.
 * This tool never invents syntax, examples, sources, or verification flags.
 *
 * Usage:
 *   node scripts/commands/audit-evidence-pipeline.mjs
 *   node scripts/commands/audit-evidence-pipeline.mjs --strict
 */
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const canonicalPath = path.join(root, "data/commands/canonical.json");
const researchRoot = path.join(root, "data/commands/research");
const outputRoot = path.join(root, ".cache");
const strict = process.argv.includes("--strict");

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const canonical = await readJson(canonicalPath);
if (!Array.isArray(canonical.records) || canonical.records.length !== canonical.recordCount) {
  throw new Error("Canonical command count does not match canonical.records.");
}
const requiredStrings = ["definition", "explanation", "syntax", "safetyNotes"];
const requiredArrays = ["examples", "implementationDifferences", "sources"];
const requiredEvidence = ["syntaxVerified", "examplesVerified", "busyboxTested", "humanReviewed", "provenanceVerified"];
const errors = [];
const warnings = [];
const entries = new Map();

async function visit(dir) {
  let children;
  try { children = await readdir(dir, { withFileTypes: true }); }
  catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const child of children) {
    const file = path.join(dir, child.name);
    if (child.isDirectory()) await visit(file);
    else if (child.isFile() && child.name.endsWith(".json")) {
      const record = await readJson(file);
      const name = String(record.name || path.basename(child.name, ".json"));
      if (entries.has(name)) errors.push("Duplicate research record for command: " + name);
      else entries.set(name, { ...record, _file: path.relative(root, file) });
    }
  }
}
await visit(researchRoot);

const canonicalNames = new Set();
for (const command of canonical.records) {
  const name = String(command.name || "").trim();
  if (!name) { errors.push("Canonical record has an empty command name."); continue; }
  if (canonicalNames.has(name)) errors.push("Duplicate canonical command: " + name);
  canonicalNames.add(name);
}
for (const name of entries.keys()) {
  if (!canonicalNames.has(name)) errors.push("Research record is not in canonical catalogue: " + name);
}

const complete = [];
const pending = [];
for (const command of canonical.records) {
  const name = String(command.name || "").trim();
  const lesson = entries.get(name);
  if (!lesson) { pending.push(name); continue; }
  const missing = [];
  for (const key of requiredStrings) if (typeof lesson[key] !== "string" || !lesson[key].trim()) missing.push(key);
  for (const key of requiredArrays) if (!Array.isArray(lesson[key]) || lesson[key].length === 0) missing.push(key);
  if (!Array.isArray(lesson.sources) || !lesson.sources.every((source) =>
    source && typeof source.url === "string" && /^https:\/\//.test(source.url)
    && typeof source.title === "string" && source.title.trim()
    && typeof source.accessedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.accessedAt))) {
    missing.push("sources (each needs https URL, title, and YYYY-MM-DD accessedAt)");
  }
  if (!Array.isArray(lesson.examples) || !lesson.examples.every((example) =>
    example && typeof example.command === "string" && example.command.trim()
    && typeof example.expectedBehavior === "string" && example.expectedBehavior.trim()
    && Array.isArray(example.testEvidence) && example.testEvidence.length > 0
    && example.testEvidence.every((test) => test && typeof test.environment === "string" && typeof test.result === "string" && test.result === "passed"))) {
    missing.push("examples (each needs command, expectedBehavior, and passed testEvidence)");
  }
  if (!Array.isArray(lesson.implementationDifferences) || !lesson.implementationDifferences.some((item) =>
    item && typeof item.implementation === "string" && item.implementation.trim()
    && typeof item.notes === "string" && item.notes.trim())) missing.push("implementationDifferences with implementation-specific notes");
  if (!Array.isArray(lesson.safetyNotes) || !lesson.safetyNotes.some((note) => typeof note === "string" && note.trim())) missing.push("safetyNotes");
  if (!lesson.verification || requiredEvidence.some((key) => lesson.verification[key] !== true)) {
    missing.push("verification flags: " + requiredEvidence.join(", "));
  }
  if (lesson.status !== "complete") missing.push('status="complete" only after all evidence gates pass');
  if (missing.length) {
    pending.push(name);
    warnings.push({ name, file: lesson._file, missing: [...new Set(missing)] });
  } else complete.push(name);
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  canonicalCount: canonical.records.length,
  researchRecordCount: entries.size,
  completeCount: complete.length,
  pendingCount: canonical.records.length - complete.length,
  invalidRecordCount: errors.length,
  pendingCommands: pending,
  warnings,
  errors,
};
await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(outputRoot, "command-evidence-audit.json"), JSON.stringify(report, null, 2) + "\n");
process.stdout.write("[command-evidence] " + complete.length + "/" + canonical.records.length + " evidence-complete; " + report.pendingCount + " pending; " + errors.length + " structural errors. Report: .cache/command-evidence-audit.json\n");
if (errors.length || (strict && report.pendingCount > 0)) {
  if (errors.length) process.stderr.write(errors.map((error) => "ERROR: " + error).join("\n") + "\n");
  if (strict && report.pendingCount > 0) process.stderr.write("STRICT MODE: every canonical command needs complete research and passing verification evidence.\n");
  process.exitCode = 1;
}
