import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateCommandLessonDraft, validateCommandResearchRecord } from "../scripts/commands/lesson-schema.mjs";

const schema = JSON.parse(await readFile("data/commands/schema.json", "utf8"));
const catalog = JSON.parse(await readFile("data/commands/canonical.json", "utf8"));
assert.equal(schema.type, "object");
assert.equal(schema.additionalProperties, false);
assert.equal(catalog.records.length, catalog.recordCount);
const command = { name: "grep" };
const draft = {
  name: "grep",
  definition: "Search input for lines matching a pattern.",
  explanation: "grep reads input and reports matching lines according to its selected matching mode.",
  syntax: "grep [OPTION]... PATTERN [FILE]...",
  examples: [{ command: "grep -F needle sample.txt", expectedBehavior: "Prints lines containing the literal text needle.", testPlan: "Use a temporary fixture with matching and non-matching lines." }],
  implementationDifferences: [{ implementation: "BusyBox", notes: "Check supported flags against the installed BusyBox build." }],
  safetyNotes: ["Use a disposable test file."],
  sources: [{ title: "grep manual", url: "https://www.gnu.org/software/grep/manual/grep.html", accessedAt: "" }]
};
assert.equal(validateCommandLessonDraft(command, draft), true);
assert.throws(() => validateCommandLessonDraft(command, { ...draft, name: "sed" }), /identity mismatch/);
assert.throws(() => validateCommandLessonDraft(command, { ...draft, examples: [{ command: "grep" }] }), /malformed example/);
const record = {
  schemaVersion: 1, name: "grep", status: "draft",
  definition: draft.definition, explanation: draft.explanation, syntax: draft.syntax,
  examples: [{ command: "grep -F needle sample.txt", expectedBehavior: "Prints matching lines.", testEvidence: [] }],
  implementationDifferences: draft.implementationDifferences,
  safetyNotes: draft.safetyNotes,
  sources: [{ title: "grep manual", url: "https://www.gnu.org/software/grep/manual/grep.html", accessedAt: "", verified: false }],
  verification: { syntaxVerified: false, examplesVerified: false, busyboxTested: false, humanReviewed: false, provenanceVerified: false }
};
assert.equal(validateCommandResearchRecord(record), true);
assert.throws(() => validateCommandResearchRecord({ ...record, verification: {} }), /verification.syntaxVerified/);
console.log("Command lesson draft and research-record schemas passed.");
