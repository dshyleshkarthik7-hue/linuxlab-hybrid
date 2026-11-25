import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const script = await readFile("scripts/content-factory/generate_lessons.py", "utf8");
assert.match(script, /"status": "draft"/);
assert.match(script, /"requiresHumanReview": True/);
assert.match(script, /--llm is not implemented/);
const result = execFileSync("python3", ["scripts/content-factory/generate_lessons.py", "--limit", "5", "--tier", "core", "--dry-run"], { encoding: "utf8" });
assert.match(result, /would draft 5 core entries/);
assert.match(result, /requires human review/);
console.log("content-factory draft-only contract passed");
