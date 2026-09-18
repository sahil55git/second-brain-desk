"use client";

// Per-desk AI Terminal (plan doc, Versions 17/18): type, speak, or scan a
// photo to fill the form above it. Ported from the original artifact's
// browser-native mic (Web Speech API — no dedicated speech capability
// exists on any runtime, so this is feature-detected client-side and the
// mic button simply never appears where unsupported) and its photo-scan
// path (routed through Gemini vision on the server, since that's the
// only free provider with image input). Both "review, then apply" and
// "auto-apply" modes are offered, per Sahil's explicit ask that both be
// switchable rather than one fixed default — though to keep a hard
// safety line, auto-apply only fills the form's fields; it never
// submits/saves for you.

import { useEffect, useRef, useState } from "react";
import { AI_FILL_SCHEMAS, type AiFillDesk } from "@/lib/aiFillSchemas";

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

export default function AiTerminal({
  desk,
  onFill,
  title = "AI Terminal",
}: {
  desk: AiFillDesk;
  onFill: (fields: Record<string, unknown>) => void;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, unknown> | null>(null);
  const [autoApply, setAutoApply] = useState(false);
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    setMicSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const spec = AI_FILL_SCHEMAS[desk];

  async function submit(overrideText?: string, image?: { base64: string; mime: string }) {
    const t = overrideText ?? text;
    if (!t && !image) return;
    setLoading(true);
    setError(null);
    setFields(null);
    try {
      const res = await fetch("/api/ai-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desk, text: t, imageBase64: image?.base64, imageMime: image?.mime }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || "AI request failed.");
        return;
      }
      if (autoApply) {
        onFill(json.fields);
        setText("");
      } else {
        setFields(json.fields);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed.");
    } finally {
      setLoading(false);
    }
  }

  function toggleMic() {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript || "";
      setText(transcript);
      submit(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || "";
      submit(text || "(scan this photo)", { base64, mime: file.type || "image/jpeg" });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function apply() {
    if (!fields) return;
    onFill(fields);
    setFields(null);
    setText("");
  }

  return (
    <div className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-3 text-sm mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 font-medium text-[var(--accent-ink)]"
      >
        🤖 {title} {open ? "▲" : "▼"}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-xs opacity-60">
            Type, speak, or scan a receipt / memo / register page — it fills the form below for your
            review.
          </p>
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="e.g. Ramesh Patil, 120kg seed, shop keeps cake, ₹500 advance"
              className="flex-1 rounded border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm"
            />
            {micSupported && (
              <button
                type="button"
                onClick={toggleMic}
                title="Speak to fill"
                className={`rounded px-2.5 border ${
                  listening
                    ? "bg-red-600 text-white border-red-600 animate-pulse"
                    : "border-black/20 dark:border-white/20"
                }`}
              >
                🎤
              </button>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Scan a photo"
              className="rounded px-2.5 border border-black/20 dark:border-white/20"
            >
              📷
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onPhoto}
            />
            <button
              type="button"
              onClick={() => submit()}
              disabled={loading}
              className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-3 py-1.5 font-medium disabled:opacity-50"
            >
              {loading ? "…" : "Fill"}
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-xs opacity-70">
            <input
              type="checkbox"
              checked={autoApply}
              onChange={(e) => setAutoApply(e.target.checked)}
            />
            Auto-apply without review (you still tap the form&apos;s own Save button)
          </label>

          {error && <div className="text-red-600 text-xs">{error}</div>}

          {fields && (
            <div className="rounded border border-black/10 dark:border-white/10 p-2">
              <div className="text-xs font-medium mb-1">Review before applying:</div>
              <ul className="text-xs space-y-0.5 mb-2">
                {spec
                  .filter((f) => fields[f.key] !== undefined && fields[f.key] !== null && fields[f.key] !== "")
                  .map((f) => (
                    <li key={f.key}>
                      <span className="opacity-60">{f.label}:</span> <strong>{String(fields[f.key])}</strong>
                    </li>
                  ))}
                {spec.every(
                  (f) => fields[f.key] === undefined || fields[f.key] === null || fields[f.key] === ""
                ) && <li className="opacity-60">Nothing recognized — try again with more detail.</li>}
              </ul>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={apply}
                  className="rounded bg-[var(--accent)] text-[var(--accent-contrast)] px-3 py-1 text-xs font-medium"
                >
                  Apply to form
                </button>
                <button type="button" onClick={() => setFields(null)} className="text-xs underline opacity-70">
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
