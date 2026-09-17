// Free-model AI provider abstraction. Zero-cost by design: Google Gemini
// free tier by default (no billing, just rate limits), Groq free tier as
// a drop-in alternative. Which one runs is decided purely by which API
// key is present in the environment — no key means the AI features
// degrade to a clear "not configured" message, and everything else in
// the app keeps working.
//
// Set ONE of these in Vercel → Project → Settings → Environment Variables:
//   GEMINI_API_KEY   (from https://aistudio.google.com/apikey — free)
//   GROQ_API_KEY     (from https://console.groq.com/keys — free tier)
// Optional model overrides: GEMINI_MODEL, GROQ_MODEL.

export type AiProvider = "gemini" | "groq" | "none";

export function activeProvider(): AiProvider {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.GROQ_API_KEY) return "groq";
  return "none";
}

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

async function callGemini(system: string, user: string): Promise<AiResult> {
  const key = process.env.GEMINI_API_KEY as string;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 900 },
  };
  const res = await withTimeout((signal) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    })
  );
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    return { ok: false, provider: "gemini", error: `Gemini API ${res.status}: ${msg.slice(0, 300)}` };
  }
  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p?.text ?? "")
    .join("");
  if (!text) {
    return { ok: false, provider: "gemini", error: "Gemini returned no text (possibly blocked or empty)." };
  }
  return { ok: true, provider: "gemini", text: text.trim() };
}

async function callGroq(system: string, user: string): Promise<AiResult> {
  const key = process.env.GROQ_API_KEY as string;
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const res = await withTimeout((signal) =>
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
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
    return { ok: false, provider: "groq", error: `Groq API ${res.status}: ${msg.slice(0, 300)}` };
  }
  const json = await res.json();
  const text: string | undefined = json?.choices?.[0]?.message?.content;
  if (!text) return { ok: false, provider: "groq", error: "Groq returned no text." };
  return { ok: true, provider: "groq", text: text.trim() };
}

export async function runAi(system: string, user: string): Promise<AiResult> {
  const provider = activeProvider();
  if (provider === "none") {
    return {
      ok: false,
      provider: "none",
      notConfigured: true,
      error:
        "AI is not configured. Add a free GEMINI_API_KEY (aistudio.google.com/apikey) or GROQ_API_KEY in Vercel and redeploy.",
    };
  }
  try {
    return provider === "gemini" ? await callGemini(system, user) : await callGroq(system, user);
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    return { ok: false, provider, error: message };
  }
}
