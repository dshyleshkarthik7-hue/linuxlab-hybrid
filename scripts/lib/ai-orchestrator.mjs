/** Three-stage free-tier-only curriculum authoring pipeline. */
import { completeChat } from "./ai-provider.mjs";

export async function orchestrateDraft({ systemPrompt, userPrompt, parse, validate, maxTokens = 3000, timeoutMs = 90000, env = process.env, complete = completeChat } = {}) {
  if (typeof systemPrompt !== "string" || typeof userPrompt !== "string" || typeof parse !== "function" || typeof validate !== "function") throw new Error("orchestrateDraft requires systemPrompt, userPrompt, parse, and validate.");
  const stages = {};
  async function runStage(role, instruction, max = maxTokens, context = "") {
    const result = await complete({ role, messages: [
      { role: "system", content: systemPrompt + "\n\n" + instruction },
      { role: "user", content: userPrompt + "\n\n" + context + "\n\nReturn exactly one complete JSON object. Do not use Markdown fences." }
    ], temperature: role === "generator" ? 0.2 : 0.1, maxTokens: max, timeoutMs, env });
    let value;
    try { value = parse(result.text); } catch (error) { throw new Error(role + " stage returned invalid JSON: " + String(error?.message || error)); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(role + " stage must return a JSON object.");
    stages[role] = { provider: result.provider, model: result.model, requestedModel: result.requestedModel || result.model, usage: result.usage || null };
    return value;
  }
  const generated = await runStage("generator", "ROLE: GENERATOR. Produce a complete, precise, domain-specific draft. Cover all requested fields, state uncertainty, and never claim sources or examples were independently verified or executed.");
  const verified = await runStage("verifier", "ROLE: SKEPTICAL VERIFIER AND REPAIRER. Find and fix major factual errors, omissions, unsafe examples, invalid options, portability mistakes, unsupported source claims, and incorrect exercises. Do not invent sources, outputs, or verification evidence. Return the complete corrected JSON object.", Math.max(maxTokens, 3500), "GENERATOR DRAFT TO REVIEW:\n" + JSON.stringify(generated));
  const final = await runStage("final", "ROLE: FINAL QUALITY EDITOR. Compare the original task, generator draft, and verifier repair. Resolve remaining contradictions, omissions, schema issues, ambiguity, unsafe guidance, and shallow content. Remove unsupported claims and mark uncertainty. Never claim a citation was checked or a command executed unless it actually was. Return the entire final JSON object only.", Math.max(maxTokens, 4000), "GENERATOR DRAFT:\n" + JSON.stringify(generated) + "\n\nVERIFIER-REPAIRED DRAFT:\n" + JSON.stringify(verified));
  validate(final);
  return { draft: final, stages, strategyVersion: "three-stage-free-v1" };
}
export const AI_ORCHESTRATION_ROLES = ["generator", "verifier", "final"];
