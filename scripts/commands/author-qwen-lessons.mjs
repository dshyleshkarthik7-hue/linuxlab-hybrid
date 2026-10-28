#!/usr/bin/env node
/**
 * Qwen-assisted command lesson authoring queue.
 *
 * Generates reviewable drafts only. Qwen output is untrusted: source URLs are
 * candidates, and every verification flag stays false until independent checks
 * and a human review have actually happened.
 *
 * Usage:
 *   HF_TOKEN=... node scripts/commands/author-qwen-lessons.mjs --start 0 --count 10
 *   HF_TOKEN=... node scripts/commands/author-qwen-lessons.mjs --start 10 --count 10
 */
import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { orchestrateDraft } from "../lib/ai-orchestrator.mjs";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const arg = (name, fallback) => {
  const inline = process.argv.find((value) => value.startsWith(name + "="));
  const index = process.argv.indexOf(name);
  const raw = inline ? inline.slice(name.length + 1) : index >= 0 ? process.argv[index + 1] : undefined;
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) throw new Error(name + " must be a safe integer.");
  return parsed;
};
const start = Math.max(0, arg("--start", 0));
const count = Math.max(1, Math.min(25, arg("--count", 5)));
const delayMs = Math.max(1000, Number(process.env.QWEN_DELAY_MS || 1800));
const canonical = JSON.parse(await readFile(path.join(root, "data/commands/canonical.json"), "utf8"));
if (!Array.isArray(canonical.records) || canonical.records.length !== canonical.recordCount) throw new Error("Canonical command inventory failed its count check.");
const pilotLabel = process.env.AI_DRAFT_LABEL || "";
if (pilotLabel && !/^[a-z0-9-]{1,48}$/.test(pilotLabel)) throw new Error("AI_DRAFT_LABEL must be a lowercase slug (1-48 characters).");
const outputDir = pilotLabel ? path.join(root, "artifacts/ai-pilot", pilotLabel, "commands") : path.join(root, "data/commands/research");
await mkdir(outputDir, { recursive: true });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const parseJson = (text) => {
  const cleaned = String(text).replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("Model did not return a JSON object.");
  return JSON.parse(cleaned.slice(first, last + 1));
};
const promptFor = (command) => `You are drafting a Linux command reference for human review. Return one JSON object only with keys: name, definition, explanation, syntax, examples, implementationDifferences, safetyNotes, sources.
Command identifier: ${command.name}
Catalog category: ${command.category || "unknown"}
Catalog summary (unverified context, do not treat as proof): ${String(command.summary || "").slice(0, 500)}
Rules:
- Explain what this exact command/program is, its typical use, arguments, exit status, and limitations.
- Do not invent flags, output, environment support, or facts. If uncertain, say so in explanation and use empty arrays/strings.
- examples is an array of objects: {command, expectedBehavior, testPlan}. No fake observed output. Avoid destructive actions, privilege escalation, network attacks, and commands that alter real user data.
- implementationDifferences is an array of {implementation, notes}; distinguish GNU, BusyBox, BSD, or platform behavior only when you have a reason; use an uncertainty note instead of guessing.
- safetyNotes is an array of concrete cautions.
- sources is an array of {title, url, accessedAt}; suggest only likely authoritative documentation URLs. These are unverified candidates, not evidence. accessedAt must be today's date if you know it, otherwise empty.
- No verification booleans or claims that examples have been executed. Keep explanations detailed and specific to the named command.
`;
async function askQwen(command) {
  return orchestrateDraft({
    systemPrompt: "You are a careful Linux documentation researcher. Return valid JSON, never claim unperformed tests, and explicitly mark uncertainty.",
    userPrompt: promptFor(command),
    parse: parseJson,
    validate: draft => validateDraft(command, draft),
    maxTokens: 2200
  });
}
function validateDraft(command, draft) {
  if (draft.name !== command.name) throw new Error("Model command identity mismatch: expected " + command.name);
  for (const key of ["definition", "explanation", "syntax"]) if (typeof draft[key] !== "string") throw new Error(command.name + ": " + key + " must be a string.");
  for (const key of ["examples", "implementationDifferences", "safetyNotes", "sources"]) if (!Array.isArray(draft[key])) throw new Error(command.name + ": " + key + " must be an array.");
  if (draft.examples.some((x) => !x || typeof x.command !== "string" || typeof x.expectedBehavior !== "string" || typeof x.testPlan !== "string")) throw new Error(command.name + ": malformed example.");
  if (draft.sources.some((x) => !x || typeof x.title !== "string" || typeof x.url !== "string")) throw new Error(command.name + ": malformed source candidate.");
}
let written = 0;
const slice = canonical.records.slice(start, start + count);
if (!slice.length) throw new Error("No commands at start index " + start);
for (const command of slice) {
  const target = path.join(outputDir, command.name + ".json");
  try { await access(target); process.stdout.write("SKIP existing " + command.name + "\n"); continue; } catch {}
  try {
    const generated = await askQwen(command);
    const draft = generated.draft;
    validateDraft(command, draft);
    const record = {
      schemaVersion: 1,
      name: command.name,
      status: "draft",
      model: { provider: generated.stages.generator.provider, id: generated.stages.generator.model, strategyVersion: generated.strategyVersion, stages: generated.stages, generatedAt: new Date().toISOString() },
      definition: draft.definition,
      explanation: draft.explanation,
      syntax: draft.syntax,
      examples: draft.examples.map((x) => ({ command: x.command, expectedBehavior: x.expectedBehavior, testPlan: x.testPlan, testEvidence: [] })),
      implementationDifferences: draft.implementationDifferences,
      safetyNotes: draft.safetyNotes,
      sources: draft.sources.map((x) => ({ title: x.title, url: x.url, accessedAt: x.accessedAt || "", verified: false })),
      verification: { syntaxVerified: false, examplesVerified: false, busyboxTested: false, humanReviewed: false, provenanceVerified: false }
    };
    await writeFile(target, JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
    written++;
    process.stdout.write("DRAFT " + command.name + " [generator " + generated.stages.generator.model + "; verifier " + generated.stages.verifier.model + "; final " + generated.stages.final.model + "]\n");
  } catch (error) {
    process.stderr.write("ERROR " + command.name + ": " + String(error.message || error) + "\n");
    process.exitCode = 1;
  }
  await pause(delayMs);
}
process.stdout.write("Qwen authoring batch finished: " + written + " new drafts; " + (slice.length - written) + " skipped or failed. Drafts are not publishable until sources, syntax, examples, portability, and human review are independently verified.\n");
