// Free-model AI provider abstraction. Zero-cost by design: it calls
// whichever free-tier LLM providers have an API key set in the
// environment, in order, and returns the first successful answer. With
// several keys set this gives real redundancy — if one provider errors
// or rate-limits, the next one answers. No key at all means the AI
// features degrade to a clear "not configured" message while the rest of
// the app keeps working.
//
// Set any of these in Vercel → Project → Settings → Environment Variables
// (each is free to obtain):
//   GEMINI_API_KEY      — https://aistudio.google.com/apikey
//   OPENROUTER_API_KEY  — https://openrouter.ai/keys
//   GROQ_API_KEY        — https://console.groq.com/keys
// Optional model overrides: GEMINI_MODEL, OPENROUTER_MODEL, GROQ_MODEL —
// each pins that provider to exactly one model instead of trying the
// built-in candidate list below.
//
// Provider order (first configured one that succeeds wins): Gemini,
// OpenRouter, Groq. WITHIN each provider, several model names are tried
// in order too — free-tier model availability and free-tagged slugs
// both shift over time (a model gets retired, a free tag is pulled, a
// quota is scoped per-model), so one hardcoded model name is a single
// point of failure. Trying a short list costs nothing extra when the
// first one works, and turns "the whole provider is down" into "the
// whole provider is down" only when EVERY candidate fails.

export type AiProvider = "gemini" | "openrouter" | "groq" | "none";

export interface AiResult {
  ok: boolean;
  text?: string;
  error?: string;
  notConfigured?: boolean;
  provider: AiProvider;
}

const TIMEOUT_MS = 30000;

async function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await p(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

// Built-in fallback model candidates per provider. An env override
// (GEMINI_MODEL / OPENROUTER_MODEL / GROQ_MODEL) is tried FIRST and
// exclusively-preferred, but the built-ins still back it up if it fails,
// since a manually-set model can go stale too.
const GEMINI_MODELS = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-flash-latest"];
const OPENROUTER_MODELS = [
  "deepseek/deepseek-chat-v3-0324:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "google/gemma-2-9b-it:free",
  "qwen/qwen-2.5-7b-instruct:free",
  "mistralai/mistral-7b-instruct:free",
];
const GROQ_MODELS = ["llama-3.1-8b-instant", "gemma2-9b-it", "llama3-8b-8192"];

function candidateModels(envVar: string | undefined, builtins: string[]): string[] {
  const list = envVar ? [envVar, ...builtins.filter((m) => m !== envVar)] : builtins;
  return list;
}

async function callGeminiModel(system: string, user: string, key: string, model: string): Promise<AiResult> {
  // Use the x-goog-api-key HEADER rather than a ?key= query param — this
  // is Google's documented method and works for both classic "AIza…" keys
  // and the newer "AQ.…" key format.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 900 },
  };
  const res = await withTimeout((signal) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal,
    })
  );
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    return { ok: false, provider: "gemini", error: `Gemini (${model}) ${res.status}: ${msg.slice(0, 200)}` };
  }
  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p?.text ?? "")
    .join("");
  if (!text) return { ok: false, provider: "gemini", error: `Gemini (${model}) returned no text (blocked or empty).` };
  return { ok: true, provider: "gemini", text: text.trim() };
}

async function callOpenRouterModel(system: string, user: string, key: string, model: string): Promise<AiResult> {
  const res = await withTimeout((signal) =>
    fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "X-Title": "Second Brain Desk",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.4,
        max_tokens: 900,
      }),
      signal,
    })
  );
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    return { ok: false, provider: "openrouter", error: `OpenRouter (${model}) ${res.status}: ${msg.slice(0, 200)}` };
  }
  const json = await res.json();
  const text: string | undefined = json?.choices?.[0]?.message?.content;
  if (!text) return { ok: false, provider: "openrouter", error: `OpenRouter (${model}) returned no text.` };
  return { ok: true, provider: "openrouter", text: text.trim() };
}

async function callGroqModel(system: string, user: string, key: string, model: string): Promise<AiResult> {
  const res = await withTimeout((signal) =>
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.4,
        max_tokens: 900,
      }),
      signal,
    })
  );
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    return { ok: false, provider: "groq", error: `Groq (${model}) ${res.status}: ${msg.slice(0, 200)}` };
  }
  const json = await res.json();
  const text: string | undefined = json?.choices?.[0]?.message?.content;
  if (!text) return { ok: false, provider: "groq", error: `Groq (${model}) returned no text.` };
  return { ok: true, provider: "groq", text: text.trim() };
}

// Tries each model candidate for one provider in order, returning the
// first success. On total failure, returns every model's error joined
// together (still scoped to just this provider — runAi() below joins
// across providers on top of this).
async function tryProviderModels(
  provider: AiProvider,
  models: string[],
  call: (model: string) => Promise<AiResult>
): Promise<AiResult> {
  const errors: string[] = [];
  for (const model of models) {
    try {
      const r = await call(model);
      if (r.ok) return r;
      errors.push(r.error || `${provider} (${model}): failed`);
    } catch (err) {
      errors.push(`${provider} (${model}): ${err instanceof Error ? err.message : "request failed"}`);
    }
  }
  return { ok: false, provider, error: errors.join("  |  ") };
}

async function callGemini(system: string, user: string): Promise<AiResult> {
  const key = process.env.GEMINI_API_KEY as string;
  const models = candidateModels(process.env.GEMINI_MODEL, GEMINI_MODELS);
  return tryProviderModels("gemini", models, (model) => callGeminiModel(system, user, key, model));
}

async function callOpenRouter(system: string, user: string): Promise<AiResult> {
  const key = process.env.OPENROUTER_API_KEY as string;
  const models = candidateModels(process.env.OPENROUTER_MODEL, OPENROUTER_MODELS);
  return tryProviderModels("openrouter", models, (model) => callOpenRouterModel(system, user, key, model));
}

async function callGroq(system: string, user: string): Promise<AiResult> {
  const key = process.env.GROQ_API_KEY as string;
  const models = candidateModels(process.env.GROQ_MODEL, GROQ_MODELS);
  return tryProviderModels("groq", models, (model) => callGroqModel(system, user, key, model));
}

export async function runAi(system: string, user: string): Promise<AiResult> {
  // Build the chain from whichever keys are configured, in preference
  // order, and return the first success. If all configured providers
  // fail, return every provider's error joined together so the cause is
  // visible at a glance instead of one failure at a time.
  const chain: { name: AiProvider; call: () => Promise<AiResult> }[] = [];
  if (process.env.GEMINI_API_KEY) chain.push({ name: "gemini", call: () => callGemini(system, user) });
  if (process.env.OPENROUTER_API_KEY) chain.push({ name: "openrouter", call: () => callOpenRouter(system, user) });
  if (process.env.GROQ_API_KEY) chain.push({ name: "groq", call: () => callGroq(system, user) });

  if (chain.length === 0) {
    return {
      ok: false,
      provider: "none",
      notConfigured: true,
      error:
        "AI is not configured. Add a free GEMINI_API_KEY, OPENROUTER_API_KEY, or GROQ_API_KEY in Vercel and redeploy.",
    };
  }

  const errors: string[] = [];
  let lastProvider: AiProvider = "none";
  for (const step of chain) {
    lastProvider = step.name;
    try {
      const r = await step.call();
      if (r.ok) return r;
      errors.push(r.error || `${step.name}: failed`);
    } catch (err) {
      errors.push(`${step.name}: ${err instanceof Error ? err.message : "request failed"}`);
    }
  }
  return { ok: false, provider: lastProvider, error: errors.join("  |  ") };
}
