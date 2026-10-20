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

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const token = process.env.HF_TOKEN;
const model = process.env.HF_MODEL || "Qwen/Qwen3-8B";
const arg = (name, fallback) => {
  const eq = process.argv.find((value) => value.startsWith(name + "="));
  const next = process.argv.indexOf(name);
  return Number(eq ? eq.slice(name.length + 1) : next >= 0 ? process.argv[next + 1] : fallback);
};
const start = Math.max(0, arg("--start", 0));
const count = Math.max(1, Math.min(10, arg("--count", 5)));
if (!token) throw new Error("HF_TOKEN is required. Keep it in the environment, never in source control.");
const curriculum = JSON.parse(await readFile(path.join(root, "learn/curriculum.json"), "utf8"));
if (!Array.isArray(curriculum.lessons) || curriculum.lessons.length !== curriculum.lessonCount) throw new Error("Curriculum count contract failed.");
const outDir = path.join(root, "data/tutorial-research");
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
    const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ model, messages: [
        { role: "system", content: "You author precise Linux education content. Return valid JSON, state uncertainty, and never claim unperformed execution or source verification." },
        { role: "user", content: prompt }
      ], temperature: 0.2, max_tokens: 2200 }),
      signal: AbortSignal.timeout(90000)
    });
    if (!response.ok) throw new Error("Qwen router HTTP " + response.status + ": " + (await response.text()).slice(0, 500));
    const body = await response.json();
    const draft = asJson(body.choices?.[0]?.message?.content || "");
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
      model: { provider: "Hugging Face Inference Providers", id: model, generatedAt: new Date().toISOString() },
      content: draft,
      sourceVerification: "unverified-candidates",
      executionVerification: "not-run",
      humanReview: "pending"
    };
    await writeFile(file, JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
    created++;
    process.stdout.write("DRAFT " + lesson.id + " — " + draft.title + "\n");
  } catch (error) {
    process.stderr.write("ERROR " + lesson.id + ": " + String(error.message || error) + "\n");
    process.exitCode = 1;
  }
  await pause(Math.max(1000, Number(process.env.QWEN_DELAY_MS || 1800)));
}
process.stdout.write("Tutorial batch complete: " + created + " drafts. Nothing was published; citations, safety, examples, and pedagogy require independent review.\n");
