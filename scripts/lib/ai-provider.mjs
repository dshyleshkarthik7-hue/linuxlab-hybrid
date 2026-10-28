/**
 * Zero-cost-only chat completion adapter with resilient structured-output fallback.
 * Every requested OpenRouter model must be explicitly free; dynamic openrouter/free
 * routes are accepted only when the provider confirms the selected model is free.
 */
const DEFAULT_ORDER = ["gemini", "openrouter"];
const ROLE_DEFAULTS = {
  generator: { order: ["openrouter", "gemini"], openrouter: "arcee-ai/trinity-large-preview:free", gemini: "gemini-3.1-flash-lite" },
  verifier: { order: ["openrouter", "gemini"], openrouter: "arcee-ai/trinity-mini:free", gemini: "gemini-3.1-flash-lite" },
  final: { order: ["gemini", "openrouter"], openrouter: "openrouter/free", gemini: "gemini-3.1-flash-lite" },
  default: { order: DEFAULT_ORDER, openrouter: "openrouter/free", gemini: "gemini-3.1-flash-lite" }
};
const GEMINI_FREE_MODELS = new Set(["gemini-3.1-flash-lite", "gemini-2.5-flash-lite"]);
const OPENROUTER_SAFE_FALLBACKS = {
  generator: ["arcee-ai/trinity-large-preview:free", "arcee-ai/trinity-mini:free", "openrouter/free"],
  verifier: ["arcee-ai/trinity-mini:free", "arcee-ai/trinity-large-preview:free", "openrouter/free"],
  final: ["openrouter/free", "arcee-ai/trinity-mini:free", "arcee-ai/trinity-large-preview:free"],
  default: ["openrouter/free", "arcee-ai/trinity-mini:free", "arcee-ai/trinity-large-preview:free"]
};

function parseOrder(value) {
  const order = String(value || DEFAULT_ORDER.join(",")).split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!order.length || order.some(x => !["gemini", "openrouter", "huggingface"].includes(x))) {
    throw new Error("AI_PROVIDER_ORDER must contain only gemini, openrouter, and/or huggingface.");
  }
  return [...new Set(order)];
}
function jsonObjectLooksValid(text) {
  const cleaned = String(text || "").replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) return false;
  try {
    const parsed = JSON.parse(cleaned.slice(first, last + 1));
    return !!parsed && typeof parsed === "object" && !Array.isArray(parsed);
  } catch { return false; }
}
function modelCandidates(name, env, role) {
  const roleKey = String(role).toUpperCase();
  const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.default;
  if (name === "gemini") {
    const configured = env["AI_" + roleKey + "_GEMINI_MODELS"] || env["AI_" + roleKey + "_GEMINI_MODEL"] || env.GEMINI_MODEL;
    const list = configured ? String(configured).split(",").map(x => x.trim()).filter(Boolean) : [defaults.gemini, "gemini-2.5-flash-lite"];
    return [...new Set(list)].filter(model => {
      if (!GEMINI_FREE_MODELS.has(model)) throw new Error("Gemini model is not on the free-tier allowlist. Allowed: " + [...GEMINI_FREE_MODELS].join(", "));
      return true;
    });
  }
  if (name === "openrouter") {
    const configured = env["AI_" + roleKey + "_OPENROUTER_MODELS"] || env["AI_" + roleKey + "_OPENROUTER_MODEL"] || env.OPENROUTER_MODEL;
    const list = configured ? String(configured).split(",").map(x => x.trim()).filter(Boolean) : [defaults.openrouter, ...(OPENROUTER_SAFE_FALLBACKS[role] || OPENROUTER_SAFE_FALLBACKS.default)];
    return [...new Set(list)].filter(model => {
      if (model !== "openrouter/free" && !/:free$/i.test(model)) throw new Error("OpenRouter model must be openrouter/free or an explicitly :free model. Paid model IDs are blocked.");
      return true;
    });
  }
  if (name === "huggingface") {
    if (env.AI_ALLOW_HF_ROUTER !== "1" || env.HF_ROUTER_BILLING_DISABLED !== "1") {
      throw new Error("Hugging Face routing is disabled in zero-cost mode. Explicit opt-in and billing-disabled confirmation are required.");
    }
    if (!env.HF_TOKEN) return [];
    const model = env.HF_MODEL || "Qwen/Qwen3-8B";
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?::[A-Za-z0-9_.-]+)?$/.test(model)) throw new Error("HF_MODEL is not a valid router model ID.");
    return [model];
  }
  return [];
}
function providerConfig(name, model, env) {
  if (name === "gemini") {
    const key = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
    return key ? { provider: "Google Gemini free tier", id: model, url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key, headers: {} } : null;
  }
  if (name === "openrouter") {
    const key = env.OPENROUTER_API_KEY;
    return key ? { provider: "OpenRouter free models", id: model, url: "https://openrouter.ai/api/v1/chat/completions", key, headers: { "HTTP-Referer": "https://linuxterminal.me", "X-Title": "LinuxTerminal Curriculum Factory" } } : null;
  }
  if (name === "huggingface") {
    const key = env.HF_TOKEN;
    return key ? { provider: "Hugging Face router (explicit free-account opt-in)", id: model, url: "https://router.huggingface.co/v1/chat/completions", key, headers: {} } : null;
  }
  return null;
}

export async function completeChat({ messages, temperature = 0.2, maxTokens = 3000, timeoutMs = 90000, env = process.env, fetchImpl = fetch, providerOrder, role = "default", expectJson = false } = {}) {
  if (!Array.isArray(messages) || messages.length === 0) throw new Error("completeChat requires non-empty messages.");
  const roleKey = String(role).toUpperCase();
  if (!Object.hasOwn(ROLE_DEFAULTS, role)) throw new Error("Unknown AI orchestration role: " + role);
  const order = providerOrder ? parseOrder(providerOrder.join(",")) : parseOrder(env["AI_" + roleKey + "_PROVIDER_ORDER"] || (role === "default" ? env.AI_PROVIDER_ORDER : ROLE_DEFAULTS[role].order.join(",")));
  const errors = [];
  let configured = 0;
  for (const name of order) {
    const models = modelCandidates(name, env, role);
    for (const model of models) {
      const cfg = providerConfig(name, model, env);
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
        errors.push(name + "/" + model + ": network error (" + String(error?.name || "Error") + ")");
        continue;
      }
      if (!response.ok) {
        errors.push(name + "/" + model + ": HTTP " + response.status);
        continue;
      }
      let body;
      try { body = await response.json(); } catch { errors.push(name + "/" + model + ": invalid response JSON"); continue; }
      const text = body?.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim()) { errors.push(name + "/" + model + ": empty completion"); continue; }
      const returnedModel = String(body.model || cfg.id);
      // Dynamic routing is allowed only when the provider identifies the actual selected model as free.
      if (name === "openrouter" && (cfg.id === "openrouter/free" || /:free$/i.test(cfg.id)) && !/:free$/i.test(returnedModel)) {
        errors.push(name + "/" + model + ": selected model was not confirmed as free");
        continue;
      }
      if (expectJson && !jsonObjectLooksValid(text)) {
        errors.push(name + "/" + model + ": malformed JSON output");
        continue;
      }
      return { text, provider: cfg.provider, model: returnedModel, requestedModel: cfg.id, usage: body.usage || null };
    }
  }
  if (!configured) throw new Error("No configured free-tier AI provider. Set GEMINI_API_KEY and/or OPENROUTER_API_KEY; provider order is " + order.join(",") + ".");
  throw new Error("All configured free-tier provider/model fallbacks failed: " + errors.join("; "));
}
export const AI_PROVIDER_DEFAULT_ORDER = DEFAULT_ORDER;
