import assert from "node:assert/strict";
import { isPublishableResearch, researchPublicationErrors } from "../scripts/commands/research-publication-policy.mjs";
import { isCommandIndexable } from "../scripts/commands/indexability.mjs";
const valid = {
  status: "complete",
  definition: "A command with a specific, documented purpose.",
  explanation: "A command-specific explanation describing inputs, behavior and limitations.",
  syntax: "tool [OPTION] FILE",
  safetyNotes: ["Use disposable fixtures when testing file-changing options."],
  implementationDifferences: [{ implementation: "BusyBox", notes: "Behavior checked against the recorded BusyBox build." }],
  sources: [{ title: "Official manual", url: "https://example.org/manual", accessedAt: "2026-11-04", verified: true }],
  examples: [{ command: "tool --help", expectedBehavior: "Displays usage information.", testEvidence: [{ environment: "isolated Alpine test image", result: "passed", executedAt: "2026-11-04T00:00:00.000Z" }] }],
  verification: { syntaxVerified: true, examplesVerified: true, busyboxTested: true, humanReviewed: true, provenanceVerified: true },
  qualityScore: 95,
  review: { reviewer: "Reviewer", reviewedAt: "2026-11-04T00:00:00.000Z", notes: "Reviewed documentation, behavior evidence and portability notes." }
};
assert.equal(isPublishableResearch(valid), true);
assert.equal(isCommandIndexable({ name: "tool", url: "/commands/tool.html" }, { ...valid, internals: ["The implementation parses options before opening input files."] }), true);
for (const mutate of [
  (x) => { x.verification.humanReviewed = false; },
  (x) => { x.sources[0].verified = false; },
  (x) => { x.examples[0].testEvidence[0].result = "unknown"; },
  (x) => { x.review.reviewer = ""; },
  (x) => { x.qualityScore = 89; },
  (x) => { x.examples[0].testEvidence[0].executedAt = "not-a-date"; },
  (x) => { x.sources[0].url = "http://example.org"; }
]) {
  const candidate = structuredClone(valid);
  mutate(candidate);
  assert.equal(isPublishableResearch(candidate), false);
  assert.equal(isCommandIndexable({ name: "tool", url: "/commands/tool.html" }, { ...candidate, internals: ["Implementation detail"] }), false);
}
assert.ok(researchPublicationErrors({ ...valid, safetyNotes: [] }).includes("safetyNotes"));
console.log("Research publication policy passed positive and negative evidence-gate tests.");
