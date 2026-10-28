import assert from "node:assert/strict";
import { completeChat } from "../scripts/lib/ai-provider.mjs";

const messages = [{ role: "user", content: "Return a JSON lesson." }];
const ok = (text, usage = {}) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: text } }], usage }) });
const status = (code) => ({ ok: false, status: code, json: async () => ({}) });

{
  const calls = [];
  const result = await completeChat({
    messages, env: { GEMINI_API_KEY: "test-gemini", OPENROUTER_API_KEY: "test-openrouter" },
    fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return calls.length === 1 ? status(429) : ok("{\"ok\":true}"); }
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com/);
  assert.equal(calls[0].body.model, "gemini-3.1-flash-lite");
  assert.match(calls[1].url, /openrouter\.ai/);
  assert.equal(calls[1].body.model, "openrouter/free");
  assert.equal(result.provider, "OpenRouter free models");
  assert.equal(result.model, "openrouter/free");
}
{
  await assert.rejects(() => completeChat({ messages, env: {}, fetchImpl: async () => { throw new Error("should not call"); } }), /No configured free-tier AI provider/);
}
{
  await assert.rejects(() => completeChat({ messages, env: { OPENROUTER_API_KEY: "x", OPENROUTER_MODEL: "openai/gpt-oss-120b" }, fetchImpl: async () => ok("x") }), /explicitly :free/);
}
{
  await assert.rejects(() => completeChat({ messages, env: { GEMINI_API_KEY: "x", GEMINI_MODEL: "gemini-3.8-flash" }, fetchImpl: async () => ok("x") }), /not on the free-tier allowlist/);
}
{
  await assert.rejects(() => completeChat({ messages, env: { AI_PROVIDER_ORDER: "huggingface", HF_TOKEN: "x" }, fetchImpl: async () => ok("x") }), /disabled in zero-cost mode/);
}
{
  const result = await completeChat({ messages, providerOrder: ["openrouter"], env: { OPENROUTER_API_KEY: "x", OPENROUTER_MODEL: "qwen/qwen3:free" }, fetchImpl: async (url, init) => { assert.equal(JSON.parse(init.body).model, "qwen/qwen3:free"); return ok("done"); } });
  assert.equal(result.text, "done");
}
console.log("AI provider fallback tests passed.");
