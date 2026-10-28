import assert from "node:assert/strict";
import { completeChat } from "../scripts/lib/ai-provider.mjs";

const messages = [{ role: "user", content: "Return a JSON lesson." }];
const ok = (text, usage = {}, model = undefined) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: text } }], usage, ...(model ? { model } : {}) }) });
const status = (code) => ({ ok: false, status: code, json: async () => ({}) });

{
  const calls = [];
  const result = await completeChat({
    messages, env: { GEMINI_API_KEY: "test-gemini", OPENROUTER_API_KEY: "test-openrouter" },
    fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return calls.length === 1 ? status(429) : ok("done", {}, "qwen/qwen3:free"); }
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com/);
  assert.equal(calls[0].body.model, "gemini-3.1-flash-lite");
  assert.match(calls[1].url, /openrouter\.ai/);
  assert.equal(calls[1].body.model, "openrouter/free");
  assert.equal(result.provider, "OpenRouter free models");
  assert.equal(result.model, "qwen/qwen3:free");
  assert.equal(result.requestedModel, "openrouter/free");
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
  const calls = [];
  const result = await completeChat({
    messages, providerOrder: ["huggingface", "openrouter"],
    env: { HF_TOKEN: "hf-test", OPENROUTER_API_KEY: "or-test" },
    fetchImpl: async (url, init) => { calls.push(url); return ok("fallback worked", {}, "arcee-ai/trinity-mini:free"); }
  });
  assert.equal(calls.length, 1, "disabled optional Hugging Face routing must not prevent a later free provider from being tried");
  assert.match(calls[0], /openrouter\.ai/);
  assert.equal(result.text, "fallback worked");
}
{
  const result = await completeChat({ messages, providerOrder: ["openrouter"], env: { OPENROUTER_API_KEY: "x", OPENROUTER_MODEL: "qwen/qwen3:free" }, fetchImpl: async (url, init) => { assert.equal(JSON.parse(init.body).model, "qwen/qwen3:free"); return ok("done"); } });
  assert.equal(result.text, "done");
}

{
  const calls = [];
  const result = await completeChat({
    messages, role: "generator", providerOrder: ["openrouter"], expectJson: true,
    env: { OPENROUTER_API_KEY: "x" },
    fetchImpl: async (url, init) => {
      calls.push(JSON.parse(init.body).model);
      return calls.length === 1
        ? ok("I cannot provide JSON, sorry.")
        : ok('{"name":"pwd","definition":"Print the working directory."}', {}, "arcee-ai/trinity-mini:free");
    }
  });
  assert.equal(calls.length, 2, "malformed JSON must trigger a free-model fallback");
  assert.equal(calls[0], "arcee-ai/trinity-large-preview:free");
  assert.equal(calls[1], "arcee-ai/trinity-mini:free");
  assert.match(result.text, /"name":"pwd"/);
}
{
  const calls = [];
  const result = await completeChat({
    messages, role: "generator", providerOrder: ["openrouter"], expectJson: true,
    validateOutput: text => { if (!JSON.parse(text).definition) throw new Error("missing definition"); },
    env: { OPENROUTER_API_KEY: "x" },
    fetchImpl: async (url, init) => {
      calls.push(JSON.parse(init.body).model);
      return calls.length === 1
        ? ok('{"name":"pwd"}')
        : ok('{"name":"pwd","definition":"Print the working directory."}', {}, "arcee-ai/trinity-mini:free");
    }
  });
  assert.equal(calls.length, 2, "schema-invalid JSON must trigger a free-model fallback");
  assert.match(result.text, /definition/);
}

console.log("AI provider fallback tests passed.");
