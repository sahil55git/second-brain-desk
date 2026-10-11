"use client";

// Per-desk AI Terminal. Two halves:
//
//  1. FILL — type, speak (English / ಕನ್ನಡ / हिन्दी) or photograph a bill, receipt,
//     slip or register page; the AI drafts the form's fields (including item
//     lines) for review. "Apply" fills the form; it never saves — the person
//     still taps the form's own Save. A scanned photo is handed back so the
//     desk can keep it as proof when the entry is saved.
//  2. ASK / CHECK — ready-made questions for the desk ("Check this bill",
//     "What do I owe?") or a free question. Answer-only: the AI reads the
//     desk's records and the form being filled, and explains.
//
// Speech uses the browser's own recogniser (Chrome / Edge); the mic button only
// appears where it exists. Photo reading needs a Gemini key on the server.

import { useEffect, useRef, useState } from "react";
import { AI_FILL_SCHEMAS, type AiFillDesk } from "@/lib/aiFillSchemas";
import { DESK_PROMPTS, type AskDesk } from "@/lib/aiPrompts";
import { preparePhoto } from "@/lib/proofClient";
import type { FilledLine } from "@/lib/smartEntry";

interface SpeechRecognitionResultLike {
  results: { [i: number]: { [j: number]: { transcript: string } } };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionResultLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export interface FillMeta {
  /** The scanned photo (compressed JPEG data URL), when the fill came from a photo. */
  photoDataUrl?: string;
  source: "text" | "voice" | "photo";
}

const LANGS = [
  { id: "en-IN", label: "English" },
  { id: "kn-IN", label: "ಕನ್ನಡ" },
  { id: "hi-IN", label: "हिन्दी" },
];

const HINTS: Partial<Record<AiFillDesk, string>> = {
  purchase: "e.g. Pawan Refineries bill SIV-649, 2190 kg refined sunflower at 156, 5% GST, credit",
  sales: "e.g. Ramesh Patil, 2 tins 15 kg sunflower at 178, 1 litre karadi 210, cash",
  expense: "e.g. diesel 1500 rupees cash today, Bharat petrol pump",
  stock: "e.g. sunflower 420, karadi 1310, groundnut 85, mustard 40",
};

function readLang(): string {
  try {
    return window.localStorage.getItem("aiTerminalLang") || "en-IN";
  } catch {
    return "en-IN";
  }
}

export default function AiTerminal({
  desk,
  onFill,
  title = "AI Terminal",
  ask,
  defaultOpen = false,
}: {
  desk?: AiFillDesk;
  onFill?: (fields: Record<string, unknown>, meta: FillMeta) => void;
  title?: string;
  /** Turn on the Ask / check half: which desk's questions, and a summary of the form being filled. */
  ask?: { desk: AskDesk; form?: () => string };
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<"fill" | "ask">(desk ? "fill" : "ask");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, unknown> | null>(null);
  const [meta, setMeta] = useState<FillMeta>({ source: "text" });
  const [autoApply, setAutoApply] = useState(false);
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [lang, setLang] = useState("en-IN");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ask half
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ q: string; text: string } | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    setMicSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    setLang(readLang());
  }, []);

  const spec = desk ? AI_FILL_SCHEMAS[desk] : [];

  async function submit(overrideText?: string, image?: { dataUrl: string }, source: FillMeta["source"] = "text") {
    if (!desk) return;
    const t = overrideText ?? text;
    if (!t && !image) return;
    setLoading(true);
    setError(null);
    setFields(null);
    const m: FillMeta = { source, photoDataUrl: image?.dataUrl };
    try {
      const [head, b64] = image ? image.dataUrl.split(",") : ["", ""];
      const res = await fetch("/api/ai-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desk, text: t, imageBase64: image ? b64 : undefined, imageMime: image ? head.slice(5, head.indexOf(";")) : undefined }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || "AI request failed.");
        if (image) setMeta(m); // keep the photo so it can still be filed with a hand-typed entry
        return;
      }
      if (autoApply) {
        onFill?.(json.fields, m);
        setText("");
      } else {
        setFields(json.fields);
        setMeta(m);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed.");
    } finally {
      setLoading(false);
    }
  }

  function toggleMic() {
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript || "";
      if (tab === "ask") {
        setQuestion(transcript);
        void runAsk(undefined, transcript);
      } else {
        setText(transcript);
        void submit(transcript, undefined, "voice");
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await preparePhoto(file); // shrunk JPEG: faster upload, still readable
      void submit(text || "(read this photo)", { dataUrl }, "photo");
    } catch {
      setError("The picture could not be read. Take it again.");
    }
  }

  function apply() {
    if (!fields) return;
    onFill?.(fields, meta);
    setFields(null);
    setText("");
  }

  async function runAsk(promptId?: string, q?: string) {
    if (!ask) return;
    const qq = (q ?? question).trim();
    if (!promptId && !qq) return;
    setAsking(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/desk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desk: ask.desk, promptId, question: promptId ? undefined : qq, form: ask.form?.() ?? "" }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || "AI request failed.");
        return;
      }
      const label = promptId ? DESK_PROMPTS[ask.desk].find((p) => p.id === promptId)?.label ?? promptId : qq;
      setAnswer({ q: label, text: json.answer });
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed.");
    } finally {
      setAsking(false);
    }
  }

  const shown = (k: string) => fields && fields[k] !== undefined && fields[k] !== null && fields[k] !== "";
  const btn = "rounded px-2.5 border border-black/20 dark:border-white/20";

  return (
    <div className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-3 text-sm mb-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 font-medium text-[var(--accent-ink)]">
        🤖 {title} {open ? "▲" : "▼"}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {desk && ask && (
            <div className="flex gap-1 text-xs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "fill"} onClick={() => setTab("fill")} className={`rounded px-2.5 py-1 border ${tab === "fill" ? "bg-[var(--accent)] text-[var(--accent-contrast)] border-[var(--accent)]" : "border-black/20 dark:border-white/20"}`}>
                ✍️ Fill the form
              </button>
              <button type="button" role="tab" aria-selected={tab === "ask"} onClick={() => setTab("ask")} className={`rounded px-2.5 py-1 border ${tab === "ask" ? "bg-[var(--accent)] text-[var(--accent-contrast)] border-[var(--accent)]" : "border-black/20 dark:border-white/20"}`}>
                💬 Ask / check
              </button>
            </div>
          )}

          {micSupported && (
            <label className="flex items-center gap-1.5 text-xs opacity-80">
              🎤 Speak in
              <select
                value={lang}
                onChange={(e) => {
                  setLang(e.target.value);
                  try {
                    window.localStorage.setItem("aiTerminalLang", e.target.value);
                  } catch {
                    /* private window */
                  }
                }}
                className="rounded border border-black/20 dark:border-white/20 bg-transparent px-1 py-0.5"
              >
                {LANGS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {tab === "fill" && desk && (
            <>
              <p className="text-xs opacity-60">Type, speak, or photograph a bill / receipt / slip — it fills the form below for you to check. Nothing is saved until you tap the form&apos;s Save.</p>
              <div className="flex gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder={HINTS[desk] ?? "e.g. Ramesh Patil, 120kg seed, shop keeps cake, ₹500 advance"}
                  className="flex-1 min-w-0 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm"
                />
                {micSupported && (
                  <button type="button" onClick={toggleMic} title="Speak to fill" className={`rounded px-2.5 border ${listening ? "bg-red-600 text-white border-red-600 animate-pulse" : "border-black/20 dark:border-white/20"}`}>
                    🎤
                  </button>
                )}
                <button type="button" onClick={() => fileInputRef.current?.click()} title="Photograph a bill or receipt" className={btn}>
                  📷
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
                <button type="button" onClick={() => submit()} disabled={loading} className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-3 py-1.5 font-medium disabled:opacity-50">
                  {loading ? "…" : "Fill"}
                </button>
              </div>
              <label className="flex items-center gap-1.5 text-xs opacity-70">
                <input type="checkbox" checked={autoApply} onChange={(e) => setAutoApply(e.target.checked)} />
                Auto-apply without review (you still tap the form&apos;s own Save button)
              </label>
              {loading && <div className="text-xs opacity-70">Reading… a bill photo can take 10–20 seconds.</div>}

              {fields && (
                <div className="rounded border border-black/10 dark:border-white/10 p-2">
                  <div className="text-xs font-medium mb-1">Check against the paper, then apply:</div>
                  {meta.photoDataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={meta.photoDataUrl} alt="Scanned bill" className="max-h-40 rounded border border-black/10 mb-2" />
                  )}
                  <ul className="text-xs space-y-0.5 mb-2">
                    {spec.filter((f) => f.type !== "lines" && shown(f.key)).map((f) => (
                      <li key={f.key}>
                        <span className="opacity-60">{f.label}:</span> <strong>{String(fields[f.key])}</strong>
                      </li>
                    ))}
                  </ul>
                  {spec.some((f) => f.type === "lines" && shown(f.key)) && (
                    <div className="overflow-x-auto mb-2">
                      <table className="text-xs w-full">
                        <thead className="opacity-60 text-left">
                          <tr>
                            <th className="pr-2">Item</th>
                            <th className="pr-2 text-right">Qty</th>
                            <th className="pr-2 text-right">Rate ₹</th>
                            <th className="pr-2 text-right">GST %</th>
                            <th className="text-right">Amount ₹</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(fields.lines as FilledLine[]).map((l, i) => (
                            <tr key={i} className="border-t border-black/5 dark:border-white/5">
                              <td className="pr-2">{l.name}{l.hsnCode ? <span className="opacity-50"> · HSN {l.hsnCode}</span> : null}</td>
                              <td className="pr-2 text-right tabular-nums">{l.qty ?? "?"} {l.unit}</td>
                              <td className="pr-2 text-right tabular-nums">{l.rateInr ?? "?"}</td>
                              <td className="pr-2 text-right tabular-nums">{l.gstRatePct ?? "—"}</td>
                              <td className="text-right tabular-nums">{l.qty != null && l.rateInr != null ? (l.qty * l.rateInr).toFixed(2) : "?"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {spec.every((f) => !shown(f.key)) && <div className="text-xs opacity-60 mb-2">Nothing recognised — try again with more detail or a clearer photo.</div>}
                  <div className="flex gap-2">
                    <button type="button" onClick={apply} className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-3 py-1 text-xs font-medium">
                      Apply to form
                    </button>
                    <button type="button" onClick={() => setFields(null)} className="text-xs underline opacity-70">
                      Discard
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "ask" && ask && (
            <>
              <p className="text-xs opacity-60">Ready questions check what you are entering against your records. The AI only answers — it never saves or changes anything.</p>
              <div className="flex flex-wrap gap-1.5">
                {DESK_PROMPTS[ask.desk].map((p) => (
                  <button key={p.id} type="button" disabled={asking} onClick={() => runAsk(p.id)} className="rounded-full border border-black/20 dark:border-white/20 px-2.5 py-1 text-xs hover:border-[var(--accent)] disabled:opacity-50">
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runAsk()}
                  placeholder="Or ask anything about this desk…"
                  className="flex-1 min-w-0 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm"
                />
                {micSupported && (
                  <button type="button" onClick={toggleMic} title="Speak your question" className={`rounded px-2.5 border ${listening ? "bg-red-600 text-white border-red-600 animate-pulse" : "border-black/20 dark:border-white/20"}`}>
                    🎤
                  </button>
                )}
                <button type="button" onClick={() => runAsk()} disabled={asking || !question.trim()} className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-3 py-1.5 font-medium disabled:opacity-50">
                  {asking ? "…" : "Ask"}
                </button>
              </div>
              {asking && <div className="text-xs opacity-70">Thinking…</div>}
              {answer && (
                <div className="rounded border border-black/10 dark:border-white/10 p-2">
                  <div className="text-xs font-medium mb-1 opacity-70">{answer.q}</div>
                  <div className="text-sm whitespace-pre-wrap">{answer.text}</div>
                  <div className="text-[11px] opacity-50 mt-1">AI answer from your records — check the figures before acting on them.</div>
                </div>
              )}
            </>
          )}

          {error && <div className="text-red-600 text-xs">{error}</div>}
        </div>
      )}
    </div>
  );
}
