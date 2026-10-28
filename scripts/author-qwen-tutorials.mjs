#!/usr/bin/env node
/**
 * Qwen-assisted detailed tutorial authoring queue.
 * Outputs review drafts only; it never overwrites the learner-facing curriculum.
 *
 * Usage:
 *   HF_TOKEN=... node scripts/author-qwen-tutorials.mjs --start 0 --count 5
 */
import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { completeChat } from "./lib/ai-provider.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const arg = (name, fallback) => {
  const eq = process.argv.find((value) => value.startsWith(name + "="));
  const next = process.argv.indexOf(name);
  const raw = eq ? eq.slice(name.length + 1) : next >= 0 ? process.argv[next + 1] : undefined;
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) throw new Error(name + " must be a safe integer.");
  return parsed;
};
const start = Math.max(0, arg("--start", 0));
const count = Math.max(1, Math.min(10, arg("--count", 5)));
const curriculum = JSON.parse(await readFile(path.join(root, "learn/curriculum.json"), "utf8"));
if (!Array.isArray(curriculum.lessons) || curriculum.lessons.length !== curriculum.lessonCount) throw new Error("Curriculum count contract failed.");
const pilotLabel = process.env.AI_DRAFT_LABEL || "";
if (pilotLabel && !/^[a-z0-9-]{1,48}$/.test(pilotLabel)) throw new Error("AI_DRAFT_LABEL must be a lowercase slug (1-48 characters).");
const outDir = pilotLabel ? path.join(root, "artifacts/ai-pilot", pilotLabel, "tutorials") : path.join(root, "data/tutorial-research");
await mkdir(outDir, { recursive: true });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const asJson = (text) => {
  const raw = String(text).replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("Model did not return a JSON object.");
  return JSON.parse(raw.slice(a, b + 1));
};
let created = 0;
for (const lesson of curriculum.lessons.slice(start, start + count)) {
  const id = String(lesson.id || "").replace(/[^A-Za-z0-9_.-]/g, "-");
  if (!id) { process.stderr.write("SKIP lesson without stable id\n"); continue; }
  const file = path.join(outDir, id + ".json");
  try { await access(file); process.stdout.write("SKIP existing draft " + id + "\n"); continue; } catch {}
  const prompt = `Write a detailed, topic-specific Linux tutorial lesson for a learning platform. Return JSON only with keys title, objective, explanation, workedExample, expectedResult, exercise, knowledgeCheck, safetyNotes, sources.
Existing lesson context (unverified): ${JSON.stringify({ id: lesson.id, track: lesson.track, topic: lesson.topic, title: lesson.title, objective: lesson.objective, explanation: lesson.explanation, workedExample: lesson.workedExample, expectedResult: lesson.expectedResult, exercise: lesson.exercise, knowledgeCheck: lesson.knowledgeCheck }).slice(0, 5000)}
Requirements:
- Preserve the topic and intended level. Provide a clear detailed explanation with prerequisite concepts, step-by-step reasoning, and common misconceptions.
- Worked example must be safe and relevant; use temporary/example paths and read-only commands where possible. Never include destructive root commands, credentials, real network attacks, or commands that delete broad paths.
- Explain expected behavior without pretending to have executed the example. Provide reproducible validation steps.
- Exercise must be a concrete hands-on task with clear completion criteria. Knowledge check must be a topic-specific question with its answer and rationale.
- Sources are candidate references as {title,url}; prefer official Linux man pages, GNU/Bash docs, kernel docs, or authoritative project docs. Do not claim they were verified.
- No markdown fences. Every field must be a non-empty string except safetyNotes and sources which must be non-empty arrays. Make the content genuinely specific, not a generic reflection template.
`;
  try {
    const completion = await completeChat({ messages: [
      { role: "system", content: "You author precise Linux education content. Return valid JSON, state uncertainty, and never claim unperformed execution or source verification." },
      { role: "user", content: prompt }
    ], temperature: 0.2, maxTokens: 2200 });
    const draft = asJson(completion.text);
    for (const key of ["title","objective","explanation","workedExample","expectedResult","exercise","knowledgeCheck"]) {
      if (typeof draft[key] !== "string" || !draft[key].trim()) throw new Error("Missing required field " + key);
    }
    if (!Array.isArray(draft.safetyNotes) || !draft.safetyNotes.length || !Array.isArray(draft.sources) || !draft.sources.length) throw new Error("safetyNotes and candidate sources must be non-empty arrays");
    const record = {
      schemaVersion: 1,
      lessonId: lesson.id,
      track: lesson.track,
      topic: lesson.topic,
      status: "draft",
      model: { provider: completion.provider, id: completion.model, generatedAt: new Date().toISOString() },
      content: draft,
      sourceVerification: "unverified-candidates",
      executionVerification: "not-run",
      humanReview: "pending"
    };
    await writeFile(file, JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
    created++;
    process.stdout.write("DRAFT " + lesson.id + " — " + draft.title + " [" + completion.provider + " / " + completion.model + "]\n");
  } catch (error) {
    process.stderr.write("ERROR " + lesson.id + ": " + String(error.message || error) + "\n");
    process.exitCode = 1;
  }
  await pause(Math.max(1000, Number(process.env.QWEN_DELAY_MS || 1800)));
}
process.stdout.write("Tutorial batch complete: " + created + " drafts. Nothing was published; citations, safety, examples, and pedagogy require independent review.\n");
