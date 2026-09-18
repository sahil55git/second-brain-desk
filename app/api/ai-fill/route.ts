import { NextRequest, NextResponse } from "next/server";
import { runAi } from "@/lib/aiProvider";
import { AI_FILL_SCHEMAS, buildFillPrompt, type AiFillDesk } from "@/lib/aiFillSchemas";

// Per-desk AI Terminal fill endpoint (plan doc, Version 17/18): takes
// typed text, a speech-to-text transcript, or a scanned photo, and
// returns a strict-JSON subset of that desk's form fields for the client
// to show for review (or auto-apply, per the terminal's own toggle).
//
// Photo scanning (OCR) needs a vision-capable model — of the three free
// providers wired up in lib/aiProvider.ts, only Gemini supports image
// input, so photo scans go through Gemini directly and fail clearly if
// GEMINI_API_KEY isn't set. Text/voice fills try Gemini first (more
// reliable at strict JSON), then fall back to the same free-model chain
// the Reports & AI tab uses.

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

function extractJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .trim()
    .replace(/^```(json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function callGeminiFill(
  system: string,
  userText: string,
  imageBase64?: string,
  imageMime?: string
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, error: "Gemini not configured" };
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const parts: Record<string, unknown>[] = [{ text: userText || "(no text — read the attached image)" }];
  if (imageBase64) {
    parts.push({ inlineData: { mimeType: imageMime || "image/jpeg", data: imageBase64 } });
  }
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
  };
  try {
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
      return { ok: false, error: `Gemini ${res.status}: ${msg.slice(0, 200)}` };
    }
    const json = await res.json();
    const text: string | undefined = json?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p?.text ?? "")
      .join("");
    if (!text) return { ok: false, error: "Gemini returned no text (blocked or empty)." };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gemini request failed" };
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const desk = body.desk as AiFillDesk;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : undefined;
  const imageMime = typeof body.imageMime === "string" ? body.imageMime : undefined;

  if (!desk || !AI_FILL_SCHEMAS[desk]) {
    return NextResponse.json({ error: "Unknown desk" }, { status: 400 });
  }
  if (!text && !imageBase64) {
    return NextResponse.json({ error: "Provide text, speech, or a photo." }, { status: 400 });
  }

  const system = buildFillPrompt(desk);

  if (imageBase64) {
    const r = await callGeminiFill(system, text, imageBase64, imageMime);
    if (!r.ok) {
      return NextResponse.json(
        { error: `Photo scan needs a working Gemini API key. ${r.error}`, provider: "gemini" },
        { status: 502 }
      );
    }
    const fields = extractJson(r.text);
    if (!fields) {
      return NextResponse.json(
        { error: "Could not parse a clean answer from the scan.", raw: r.text },
        { status: 502 }
      );
    }
    return NextResponse.json({ fields, provider: "gemini" });
  }

  const gem = await callGeminiFill(system, text);
  if (gem.ok) {
    const fields = extractJson(gem.text);
    if (fields) return NextResponse.json({ fields, provider: "gemini" });
  }

  const result = await runAi(system, text);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, notConfigured: result.notConfigured || false, provider: result.provider },
      { status: result.notConfigured ? 200 : 502 }
    );
  }
  const fields = extractJson(result.text || "");
  if (!fields) {
    return NextResponse.json({ error: "Could not parse a clean answer.", raw: result.text }, { status: 502 });
  }
  return NextResponse.json({ fields, provider: result.provider });
}
