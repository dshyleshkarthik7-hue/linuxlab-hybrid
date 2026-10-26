#!/usr/bin/env node
/**
 * Structural and repetition audit for the 520-activity curriculum.
 * It does not claim pedagogical correctness; human/domain review is a separate gate.
 * Usage: node scripts/audit-curriculum.mjs [--strict]
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const strict = process.argv.includes("--strict");
const requireHumanReview = process.argv.includes("--require-human-review");
const curriculum = JSON.parse(await readFile(path.join(root, "learn/curriculum.json"), "utf8"));
const lessons = curriculum.lessons;
const errors = [];
const warnings = [];
const required = ["id", "track", "topic", "title", "objective", "explanation", "workedExample", "expectedResult", "exercise", "knowledgeCheck"];
const seenIds = new Set();
const contentHashes = new Map();
const genericPhrases = [
  /using the observable behavior of the example, not a memorized definition/i,
  /what important claim does it not establish/i,
  /it does not prove broader system state that the commands do not inspect/i,
  /record the actual output and compare it with this expectation/i
];
for (const [index, lesson] of lessons.entries()) {
  for (const key of required) {
    if (typeof lesson[key] !== "string" || !lesson[key].trim()) errors.push("Lesson " + index + " missing " + key);
  }
  if (lesson.id && seenIds.has(lesson.id)) errors.push("Duplicate lesson id: " + lesson.id);
  if (lesson.id) seenIds.add(lesson.id);
  if (lesson.workedExample && /No command supplied|TODO|lorem ipsum/i.test(lesson.workedExample)) warnings.push({ id: lesson.id, issue: "placeholder worked example" });
  const text = [lesson.objective, lesson.explanation, lesson.workedExample, lesson.expectedResult, lesson.exercise, lesson.knowledgeCheck].join("\n").trim().toLowerCase().replace(/\s+/g, " ");
  if (contentHashes.has(text)) warnings.push({ id: lesson.id, issue: "duplicate lesson body", duplicateOf: contentHashes.get(text) });
  else contentHashes.set(text, lesson.id);
  const matched = genericPhrases.filter((pattern) => pattern.test([lesson.objective, lesson.exercise, lesson.knowledgeCheck].join("\n"))).length;
  if (matched >= 2) warnings.push({ id: lesson.id, issue: "template-heavy reflection prompts; review for topic-specific assessment" });
  if (lesson.workedExample && /\brm\s+-rf\s+\//.test(lesson.workedExample)) errors.push("Unsafe destructive example in lesson " + lesson.id);
}
if (!Array.isArray(lessons) || lessons.length !== curriculum.lessonCount) errors.push("Curriculum lessonCount does not match lessons array.");
const trackCounts = new Map();
for (const lesson of lessons) trackCounts.set(lesson.track, (trackCounts.get(lesson.track) || 0) + 1);
for (const track of curriculum.tracks || []) {
  if (trackCounts.get(track.name) !== track.count) errors.push("Track count mismatch for " + track.name);
}
const humanReviewed = lessons.filter((lesson) => lesson.reviewStatus === "reviewed" && lesson.reviewer && lesson.reviewedAt).length;
const examplesExecutionVerified = lessons.filter((lesson) => lesson.exampleExecutionStatus === "passed" && lesson.executionEnvironment && lesson.executedAt).length;
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  lessonCount: lessons.length,
  uniqueIds: seenIds.size,
  uniqueBodies: contentHashes.size,
  humanReviewed,
  examplesExecutionVerified,
  duplicateBodies: lessons.length - contentHashes.size,
  errors,
  warnings,
  disclaimer: "Structural checks do not prove factual accuracy. Topic-specific expert review and execution in a stated test environment are still required."
};
await mkdir(path.join(root, ".cache"), { recursive: true });
await writeFile(path.join(root, ".cache/curriculum-audit.json"), JSON.stringify(report, null, 2) + "\n");
process.stdout.write("[curriculum-audit] " + lessons.length + " activities; " + seenIds.size + " unique IDs; " + contentHashes.size + " unique full bodies; " + errors.length + " errors; " + warnings.length + " review warnings. Report: .cache/curriculum-audit.json\n");
if (errors.length || (strict && warnings.length) || (requireHumanReview && (humanReviewed !== lessons.length || examplesExecutionVerified !== lessons.length))) {
  if (errors.length) process.stderr.write(errors.join("\n") + "\n");
  if (strict && warnings.length) process.stderr.write("STRICT MODE: review all curriculum warnings before release.\n");
  process.exitCode = 1;
}
