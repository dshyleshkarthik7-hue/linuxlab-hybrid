#!/usr/bin/env node
/**
 * Deterministic Phase 1 baseline checks. This is a repository contract audit,
 * not a substitute for a live penetration test or a production deployment test.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const readText = (relative) => readFile(path.join(root, relative), "utf8");
const readJson = async (relative) => JSON.parse(await readText(relative));
const fail = (message) => { throw new Error("[phase1-readiness] " + message); };
const requireCondition = (condition, message) => { if (!condition) fail(message); };

const pkg = await readJson("package.json");
const lock = await readJson("package-lock.json");
const lockRoot = lock.packages?.[""];
requireCondition(pkg.name === "linuxterminal", "unexpected package identity");
requireCondition(Number.parseInt(String(pkg.engines?.node || "").replace(/^[^0-9]*/, ""), 10) >= 22, "Node.js 22+ must be declared");
requireCondition(lockRoot?.version === pkg.version, "package-lock root version differs from package.json");
requireCondition(lockRoot?.dependencies?.mongodb === pkg.dependencies?.mongodb, "MongoDB dependency differs between package and lockfile");
for (const script of ["build", "lint", "test:ci", "test:security", "test:iso", "test:site-routes", "phase1:check"]) {
  requireCondition(typeof pkg.scripts?.[script] === "string" && pkg.scripts[script].length > 0, "missing npm script: " + script);
}

const [canonical, authored, inventory, curriculum, manifest] = await Promise.all([
  readJson("data/commands/canonical.json"),
  readJson("data/commands/index.json"),
  readJson("data/commands/inventory.json"),
  readJson("learn/curriculum.json"),
  readJson("artifacts/manifest.json"),
]);
requireCondition(Array.isArray(canonical.records) && canonical.records.length > 0, "canonical command records missing");
requireCondition(canonical.recordCount === canonical.records.length, "canonical recordCount is stale");
const names = canonical.records.map((record) => String(record.name || "").trim().toLowerCase());
requireCondition(names.every(Boolean), "canonical catalog contains an empty command name");
requireCondition(new Set(names).size === names.length, "canonical command names are not unique");
requireCondition(canonical.uniqueRecordNames === new Set(names).size, "canonical uniqueRecordNames is stale");
requireCondition(Array.isArray(authored.records) && Array.isArray(inventory.records), "command source inventories missing");
requireCondition(authored.records.length === authored.target?.authoredRecords, "authored source count metadata is stale");
requireCondition(inventory.records.length === authored.target?.inventoryRecords, "inventory source count metadata is stale");

const pageStatus = Object.create(null);
const intelligenceStatus = Object.create(null);
let entriesWithAuthoredIntelligence = 0;
let entriesWithExecutableExamples = 0;
let nameOnlyStubs = 0;
const enrichedRecords = canonical.records.filter((record) => typeof record.id === "string" && record.id.trim());
for (const record of canonical.records) {
  requireCondition(typeof record.name === "string" && record.name.trim(), "command record has no name");
  if (!record.id) {
    // The canonical dataset intentionally preserves inventory-only name stubs.
    requireCondition(Object.keys(record).every((key) => key === "name"), "name-only catalog entry has unexpected metadata: " + record.name);
    nameOnlyStubs++;
    continue;
  }
  requireCondition(typeof record.id === "string" && record.id.trim(), "command record has an invalid stable id");
  requireCondition(typeof record.url === "string" && record.url.startsWith("/"), "command " + record.name + " has no local canonical URL");
  requireCondition(typeof record.page?.status === "string" && record.page.status.trim(), "command " + record.name + " has no page status");
  requireCondition(typeof record.intelligence?.status === "string" && record.intelligence.status.trim(), "command " + record.name + " has no intelligence status");
  pageStatus[record.page.status] = (pageStatus[record.page.status] || 0) + 1;
  intelligenceStatus[record.intelligence.status] = (intelligenceStatus[record.intelligence.status] || 0) + 1;
  if (record.intelligence?.syntax && record.intelligence?.description) entriesWithAuthoredIntelligence++;
  if (record.execution?.tryEnabled === true) entriesWithExecutableExamples++;
}
const ids = enrichedRecords.map((record) => record.id);
requireCondition(new Set(ids).size === ids.length, "canonical enriched command IDs are not unique");
requireCondition(enrichedRecords.length + nameOnlyStubs === canonical.records.length, "canonical catalog records are not fully classified");

requireCondition(Array.isArray(curriculum.lessons), "curriculum lessons missing");
requireCondition(curriculum.lessonCount === curriculum.lessons.length, "curriculum lessonCount is stale");
requireCondition(new Set(curriculum.lessons.map((lesson) => lesson.id)).size === curriculum.lessons.length, "curriculum lesson IDs are not unique");
requireCondition(curriculum.tracks.reduce((sum, track) => sum + track.count, 0) === curriculum.lessons.length, "curriculum track totals do not match lesson count");

requireCondition(Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0, "release artifact manifest is empty");
const artifactNames = new Set();
for (const artifact of manifest.artifacts) {
  requireCondition(typeof artifact.filename === "string" && artifact.filename, "artifact filename missing");
  requireCondition(!artifactNames.has(artifact.filename), "duplicate artifact filename: " + artifact.filename);
  artifactNames.add(artifact.filename);
  requireCondition(Number.isSafeInteger(artifact.size) && artifact.size > 0, "invalid artifact size: " + artifact.filename);
  requireCondition(/^[a-f0-9]{64}$/i.test(artifact.sha256 || ""), "invalid SHA-256 digest: " + artifact.filename);
  requireCondition(Array.isArray(artifact.fallbackUrls), "artifact fallbackUrls missing: " + artifact.filename);
}

const [readme, threatModel, architecture, security, license, netlify, tutor, ci] = await Promise.all([
  readText("README.md"), readText("THREAT_MODEL.md"), readText("ARCHITECTURE.md"),
  readText("SECURITY.md"), readText("LICENSE"), readText("netlify.toml"),
  readText("netlify/edge-functions/tutor.ts"), readText(".github/workflows/ci.yml"),
]);
for (const [label, content] of [["README", readme], ["threat model", threatModel], ["architecture", architecture], ["security policy", security]]) {
  requireCondition(/not a host-kernel security boundary/i.test(content), label + " must state the browser VM security boundary");
}
requireCondition(/Proprietary License/i.test(license), "license status needs explicit documentation");
requireCondition(/path = "\/api\/tutor"/.test(netlify), "Netlify tutor route missing");
requireCondition(/MAX_BODY_BYTES/.test(tutor) && /MAX_QUESTION_CHARS/.test(tutor), "tutor request bounds are not visible in implementation");
requireCondition(/permissions:\s*\n\s+contents: read/.test(ci), "CI must declare least-privilege default contents permissions");
requireCondition(/npm run phase1:check/.test(ci), "Phase 1 readiness gate is not wired into CI");

const summary = {
  result: "PASS",
  checks: ["Node and package-lock consistency", "required build/test/security scripts", "canonical command IDs, names, URLs, and explicit statuses", "curriculum IDs and track totals", "artifact size and SHA-256 metadata", "browser-VM security-boundary documentation", "tutor request-size controls", "least-privilege CI permissions and mandatory readiness gate"],
  commands: { total: canonical.records.length, enrichedRecords: enrichedRecords.length, nameOnlyStubs, pageStatus, intelligenceStatus, authoredIntelligenceRecords: entriesWithAuthoredIntelligence, tryEnabledRecords: entriesWithExecutableExamples },
  curriculum: { total: curriculum.lessons.length, tracks: curriculum.tracks.length },
  artifacts: manifest.artifacts.length,
  note: "Structural contract only; it does not prove lesson accuracy, live deployment health, browser host isolation, or absence of vulnerabilities.",
};
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
