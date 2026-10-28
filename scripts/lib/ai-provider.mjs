/**
 * Free-tier-only chat completion adapter for the curriculum factory.
 *
 * Default route: Gemini free tier -> OpenRouter free-model router.
 * Never falls back to a paid model. Gemini projects must have billing disabled;
 * free-tier quotas are provider-controlled and can change.
 *
 * Hugging Face routed inference is an opt-in legacy path only. It requires an
 * explicit acknowledgement that billing is disabled because its router may
 * otherwise route to billable providers.
 */
const DEFAULT_ORDER = ["gemini", "openrouter"];
const GEMINI_FREE_MODELS = new Set(["gemini-3.1-flash-lite", "gemini-2.5-flash-lite"]);

function parseOrder(value) {
  const order = String(value || DEFAULT_ORDER.join(",")).split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!order.length || order.some(x => !["gemini", "openrouter", "huggingface"].includes(x))) {
    throw new Error("AI_PROVIDER_ORDER must be a comma-separated list containing only gemini, openrouter, and/or huggingface.");
  }
  return [...new Set(order)];
}
function providerConfig(name, env) {
  if (name === "gemini") {
    const key = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
    if (!key) return null;
    const model = env.GEMINI_MODEL || "gemini-3.1-flash-lite";
    if (!GEMINI_FREE_MODELS.has(model)) throw new Error("Gemini model is not on the free-tier allowlist. Allowed: " + [...GEMINI_FREE_MODELS].join(", "));
    return { provider: "Google Gemini free tier", id: model, url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key, headers: {} };
  }
  if (name === "openrouter") {
    const key = env.OPENROUTER_API_KEY;
    if (!key) return null;
    const model = env.OPENROUTER_MODEL || "openrouter/free";
    if (model !== "openrouter/free" && !/:free$/i.test(model)) throw new Error("OPENROUTER_MODEL must be openrouter/free or an explicitly :free model. Paid model IDs are blocked.");
    return { provider: "OpenRouter free models", id: model, url: "https://openrouter.ai/api/v1/chat/completions", key, headers: { "HTTP-Referer": "https://linuxterminal.me", "X-Title": "LinuxTerminal Curriculum Factory" } };
  }
  if (name === "huggingface") {
    if (env.AI_ALLOW_HF_ROUTER !== "1" || env.HF_ROUTER_BILLING_DISABLED !== "1") {
      throw new Error("Hugging Face routing is disabled in zero-cost mode. To opt in, explicitly set AI_ALLOW_HF_ROUTER=1 and confirm HF_ROUTER_BILLING_DISABLED=1 only after disabling billing in that account.");
    }
    const key = env.HF_TOKEN;
    if (!key) return null;
    const model = env.HF_MODEL || "Qwen/Qwen3-8B";
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?::[A-Za-z0-9_.-]+)?$/.test(model)) throw new Error("HF_MODEL is not a valid router model ID.");
    return { provider: "Hugging Face router (explicit free-account opt-in)", id: model, url: "https://router.huggingface.co/v1/chat/completions", key, headers: {} };
  }
  return null;
}

export async function completeChat({ messages, temperature = 0.2, maxTokens = 3000, timeoutMs = 90000, env = process.env, fetchImpl = fetch, providerOrder } = {}) {
  if (!Array.isArray(messages) || messages.length === 0) throw new Error("completeChat requires non-empty messages.");
  const order = providerOrder ? parseOrder(providerOrder.join(",")) : parseOrder(env.AI_PROVIDER_ORDER);
  const errors = [];
  let configured = 0;
  for (const name of order) {
    const cfg = providerConfig(name, env);
    if (!cfg) continue;
    configured++;
    let response;
    try {
      response = await fetchImpl(cfg.url, {
        method: "POST",
        headers: { authorization: "Bearer " + cfg.key, "content-type": "application/json", ...cfg.headers },
        body: JSON.stringify({ model: cfg.id, messages, temperature, max_tokens: maxTokens }),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      errors.push(name + ": network error (" + String(error?.name || "Error") + ")");
      continue;
    }
    if (!response.ok) {
      // Do not log response bodies: providers can include request metadata in errors.
      errors.push(name + ": HTTP " + response.status);
      continue;
    }
    let body;
    try { body = await response.json(); }
    catch { errors.push(name + ": invalid JSON response"); continue; }
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      errors.push(name + ": empty completion");
      continue;
    }
    return { text, provider: cfg.provider, model: body.model || cfg.id, requestedModel: cfg.id, usage: body.usage || null };
  }
  if (!configured) throw new Error("No configured free-tier AI provider. Set GEMINI_API_KEY and/or OPENROUTER_API_KEY; provider order is " + order.join(",") + ".");
  throw new Error("All configured AI providers failed without paid fallback: " + errors.join("; "));
}

export const AI_PROVIDER_DEFAULT_ORDER = DEFAULT_ORDER;
