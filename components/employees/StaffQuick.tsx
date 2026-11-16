"use client";
// Quick entry for the employee ledger: search a person, speak or type "ramesh late 50", tap a saved
// reason (late, oil not crushed, bonus…), and see today's late arrivals with a one-tap deduction.
// Nothing is saved until the owner presses Save. Owner-only (the API refuses anyone else).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, rs } from "@/components/barrels/shared";
import { ENTRY_TYPES } from "@/lib/employeeLedger";
import { DEFAULT_SETTINGS, filterStaff, parseQuickEntry, type LateSuggestion, type StaffRule, type StaffSettings } from "@/lib/staffRules";

interface Person { id: string; name: string; role: string; phone: string | null; active: boolean; balanceInr: number }
type Draft = { emp: string; type: "CUT" | "BONUS" | "ADV" | "PAY"; amt: string; mode: string; note: string; heard?: string };
const LANGS: [string, string][] = [["en-IN", "EN"], ["hi-IN", "हिन्दी"], ["kn-IN", "ಕನ್ನಡ"]];
const LANG_KEY = "staff-speech";
const TYPES: ("CUT" | "BONUS" | "ADV" | "PAY")[] = ["CUT", "BONUS", "ADV", "PAY"];
const SHORT: Record<string, string> = { CUT: "➖ Deduct", BONUS: "➕ Extra pay", ADV: "💸 Advance", PAY: "💵 Paid" };

type Rec = {
  lang: string; interimResults: boolean; maxAlternatives: number;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void;
  onerror: (e: { error: string }) => void; onend: () => void; start: () => void; stop: () => void;
};

export default function StaffQuick({ people, onSaved }: { people: Person[]; onSaved: (text: string) => void }) {
  const active = useMemo(() => people.filter((p) => p.active), [people]);
  const [settings, setSettings] = useState<StaffSettings>(DEFAULT_SETTINGS);
  const [q, setQ] = useState("");
  const [line, setLine] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [late, setLate] = useState<LateSuggestion[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [micOk, setMicOk] = useState(false);
  const [rec, setRec] = useState(false);
  const [lang, setLang] = useState("en-IN");
  const recRef = useRef<Rec | null>(null);

  const loadLate = useCallback(async () => {
    try {
      const j = await api<{ data: LateSuggestion[]; settings: StaffSettings }>("/api/employees/late");
      setLate(j.data);
      setSettings(j.settings);
    } catch { /* attendance is optional */ }
  }, []);
  useEffect(() => { loadLate(); }, [loadLate]);
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    setMicOk(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    try { const s = localStorage.getItem(LANG_KEY); if (s) setLang(s); } catch { /* ignore */ }
  }, []);

  const found = useMemo(() => filterStaff(active, q), [active, q]);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "";

  const fromRule = (r: StaffRule, emp: string) => setDraft({ emp, type: r.kind, amt: String(r.amountInr), mode: "CASH", note: r.label });

  const understand = (text: string) => {
    setErr(null);
    const p = parseQuickEntry(text, active, settings);
    if (!p.employeeId) { setErr(`Could not tell who. Say the name first — e.g. "${active[0]?.name.split(" ")[0] ?? "Ramesh"} late 50".`); setDraft(null); return; }
    setDraft({ emp: p.employeeId, type: p.type, amt: p.amountInr ? String(p.amountInr) : "", mode: p.mode, note: p.note, heard: text });
  };

  const startVoice = () => {
    const w = window as unknown as Record<string, new () => Rec>;
    const R = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!R) return;
    if (rec) { recRef.current?.stop(); return; }
    const r = new R();
    r.lang = lang;
    r.interimResults = true;
    r.maxAlternatives = 1;
    let finalText = "";
    r.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) { t += e.results[i][0].transcript; if (e.results[i].isFinal) finalText = t; }
      setLine(t);
    };
    r.onerror = (e) => { if (e.error !== "aborted" && e.error !== "no-speech") setErr(`🎤 ${e.error}`); };
    r.onend = () => { setRec(false); if (finalText.trim()) understand(finalText); };
    recRef.current = r;
    setRec(true);
    setLine("");
    try { r.start(); } catch { setRec(false); }
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/employees/${draft.emp}/entries`, { method: "POST", json: { type: draft.type, amountInr: Number(draft.amt), mode: draft.mode, note: draft.note } });
      const word = draft.type === "CUT" ? "deducted from" : draft.type === "BONUS" ? "added for" : draft.type === "ADV" ? "advance to" : "paid to";
      onSaved(`${rs(Number(draft.amt))} ${word} ${nameOf(draft.emp)} ✓`);
      setDraft(null);
      setLine("");
      setQ("");
      loadLate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const applyLate = async (ids: string[]) => {
    setBusy(true);
    setErr(null);
    try {
      const j = await api<{ data: { applied: number } }>("/api/employees/late", { method: "POST", json: { employeeIds: ids } });
      onSaved(`${j.data.applied} late deduction${j.data.applied === 1 ? "" : "s"} added ✓`);
      loadLate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not apply.");
    } finally {
      setBusy(false);
    }
  };

  const pending = late.filter((x) => !x.done);
  const def = draft ? ENTRY_TYPES[draft.type] : null;

  return (
    <div className="bd-card bd-noprint" style={{ marginBottom: 12 }}>
      <div className="bd-row bd-gap">
        <b style={{ fontSize: 16 }}>⚡ Quick entry</b>
        <span className="bd-m small">Say or type: “Ramesh late 50”, “Suresh bonus 200”, “Ali oil not crushed”</span>
        <button className="bd-btn" style={{ marginLeft: "auto" }} onClick={() => setShowRules((v) => !v)}>⚙ Rules &amp; reasons</button>
      </div>

      <div className="bd-row" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
        <input
          value={line}
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && line.trim()) understand(line); }}
          placeholder="ramesh late 50"
          aria-label="Quick entry"
          style={{ flex: "1 1 220px", minWidth: 0, fontSize: 18, padding: "10px 12px" }}
        />
        {micOk && (
          <button className={`bd-btn${rec ? " primary" : ""}`} onClick={startVoice} aria-pressed={rec} aria-label="Speak" style={{ fontSize: 20, minWidth: 52 }}>{rec ? "⏹" : "🎤"}</button>
        )}
        <button className="bd-btn primary" disabled={!line.trim()} onClick={() => understand(line)}>Check</button>
      </div>
      {micOk && (
        <div className="bd-row" style={{ gap: 6, marginTop: 6 }}>
          {LANGS.map(([code, label]) => (
            <button key={code} type="button" className={`bd-chip${lang === code ? " on" : ""}`} style={{ cursor: "pointer" }} onClick={() => { setLang(code); try { localStorage.setItem(LANG_KEY, code); } catch { /* ignore */ } }}>{label}</button>
          ))}
          {rec && <span className="bd-m small">Listening…</span>}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search staff by name, role or phone" aria-label="Search staff" style={{ width: "100%", padding: "8px 12px" }} />
        <div className="bd-row" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {found.slice(0, 24).map((p) => (
            <button key={p.id} type="button" className={`bd-chip${draft?.emp === p.id ? " on" : ""}`} style={{ cursor: "pointer", fontSize: 14, padding: "6px 10px" }} onClick={() => setDraft((d) => d ? { ...d, emp: p.id } : { emp: p.id, type: "CUT", amt: "", mode: "CASH", note: "" })}>
              {p.name}
            </button>
          ))}
          {found.length === 0 && <span className="bd-m small">No one matches “{q}”.</span>}
        </div>
      </div>

      {draft && (
        <div className="bd-card" style={{ marginTop: 10, borderColor: "var(--bd-accent, #d9a441)" }}>
          <div className="bd-row bd-gap">
            <b>{nameOf(draft.emp)}</b>
            {draft.heard && <span className="bd-m small">heard: “{draft.heard}”</span>}
          </div>
          <div className="bd-row" style={{ gap: 6, flexWrap: "wrap", margin: "6px 0" }}>
            {TYPES.map((t) => <button key={t} type="button" className={`bd-chip${draft.type === t ? " on" : ""}`} style={{ cursor: "pointer" }} onClick={() => setDraft({ ...draft, type: t })}>{SHORT[t]}</button>)}
          </div>
          <div className="bd-row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            {settings.rules.map((r) => (
              <button key={r.id} type="button" className="bd-chip" style={{ cursor: "pointer" }} onClick={() => fromRule(r, draft.emp)}>
                {r.kind === "CUT" ? "−" : "+"}₹{r.amountInr} {r.label}
              </button>
            ))}
          </div>
          <div className="bd-row" style={{ gap: 8, flexWrap: "wrap" }}>
            <label style={{ flex: "0 0 140px" }}>Amount (₹)<input inputMode="decimal" value={draft.amt} onChange={(e) => setDraft({ ...draft, amt: e.target.value })} style={{ fontSize: 22, textAlign: "right" }} autoFocus /></label>
            <label style={{ flex: "1 1 200px" }}>Reason<input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="why" /></label>
            {def?.moves && <label>Paid by<select value={draft.mode} onChange={(e) => setDraft({ ...draft, mode: e.target.value })}><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="BANK">Bank</option></select></label>}
          </div>
          <div className="bd-m small">{def?.help}</div>
          <div className="bd-row" style={{ marginTop: 8 }}>
            <button className="bd-btn" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
            <button className="bd-btn primary" disabled={busy || !(Number(draft.amt) > 0)} onClick={save}>{busy ? "…" : `Save ${draft.type === "CUT" ? "deduction" : draft.type === "BONUS" ? "extra pay" : draft.type === "ADV" ? "advance" : "payment"}`}</button>
          </div>
        </div>
      )}

      {err && <div className="bd-err" style={{ marginTop: 8 }}>{err}</div>}

      {late.length > 0 && (
        <div className="bd-card" style={{ marginTop: 10 }}>
          <div className="bd-row bd-gap">
            <b>⏰ Late today</b>
            <span className="bd-m small">shop opens {settings.openTime}, late after {settings.graceMin} min</span>
            {pending.length > 1 && <button className="bd-btn primary" style={{ marginLeft: "auto" }} disabled={busy} onClick={() => applyLate(pending.map((x) => x.employeeId))}>Deduct all ({pending.length})</button>}
          </div>
          {late.map((x) => (
            <div key={x.employeeId} className="bd-row bd-gap" style={{ padding: "6px 0", borderTop: "1px solid rgba(255,255,255,.08)" }}>
              <b>{x.name}</b>
              <span className="bd-m small">{x.note.replace(/\s*\[late:[^\]]+\]/, "")}</span>
              {x.done ? <span className="bd-chip" style={{ marginLeft: "auto" }}>✓ deducted {rs(x.amountInr)}</span> : (
                <button className="bd-btn" style={{ marginLeft: "auto" }} disabled={busy} onClick={() => applyLate([x.employeeId])}>− {rs(x.amountInr)}</button>
              )}
            </div>
          ))}
        </div>
      )}

      {showRules && <RulesEditor settings={settings} onSaved={(s) => { setSettings(s); setShowRules(false); onSaved("Rules saved ✓"); loadLate(); }} />}
    </div>
  );
}

function RulesEditor({ settings, onSaved }: { settings: StaffSettings; onSaved: (s: StaffSettings) => void }) {
  const [s, setS] = useState<StaffSettings>(settings);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const setRule = (i: number, patch: Partial<StaffRule>) => setS({ ...s, rules: s.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const j = await api<{ data: StaffSettings }>("/api/employees/rules", { method: "PUT", json: s });
      onSaved(j.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bd-card" style={{ marginTop: 10 }}>
      <b>⚙ Shop timing &amp; reasons</b>
      <div className="bd-row" style={{ gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
        <label>Shop opens at<input type="time" value={s.openTime} onChange={(e) => setS({ ...s, openTime: e.target.value })} /></label>
        <label>Grace (minutes)<input inputMode="numeric" value={s.graceMin} onChange={(e) => setS({ ...s, graceMin: Number(e.target.value) || 0 })} style={{ width: 90 }} /></label>
        <label>Late deduction (₹)<input inputMode="decimal" value={s.lateCutInr} onChange={(e) => setS({ ...s, lateCutInr: Number(e.target.value) || 0 })} style={{ width: 110 }} /></label>
      </div>
      <div className="bd-m small">Late = marked in after opening time + grace. Example: opens 9:30, grace 10 → anyone in after 9:40 is shown under “Late today” with a one-tap ₹{s.lateCutInr} deduction.</div>
      <div style={{ marginTop: 8 }}>
        {s.rules.map((r, i) => (
          <div key={r.id} className="bd-row" style={{ gap: 6, flexWrap: "wrap", padding: "4px 0" }}>
            <select value={r.kind} onChange={(e) => setRule(i, { kind: e.target.value === "BONUS" ? "BONUS" : "CUT" })}><option value="CUT">➖ Deduct</option><option value="BONUS">➕ Extra pay</option></select>
            <input value={r.label} onChange={(e) => setRule(i, { label: e.target.value })} style={{ flex: "1 1 200px", minWidth: 0 }} aria-label="Reason" />
            <input inputMode="decimal" value={r.amountInr} onChange={(e) => setRule(i, { amountInr: Number(e.target.value) || 0 })} style={{ width: 90, textAlign: "right" }} aria-label="Amount" />
            <button className="bd-btn" onClick={() => setS({ ...s, rules: s.rules.filter((_, j) => j !== i) })} aria-label="Remove">✕</button>
          </div>
        ))}
        <button className="bd-btn" onClick={() => setS({ ...s, rules: [...s.rules, { id: `new-${s.rules.length}`, label: "", kind: "CUT", amountInr: 50 }] })}>＋ Add a reason</button>
      </div>
      {err && <div className="bd-err" style={{ marginTop: 6 }}>{err}</div>}
      <div className="bd-row" style={{ marginTop: 8 }}><button className="bd-btn primary" disabled={busy} onClick={save}>{busy ? "…" : "Save rules"}</button></div>
    </div>
  );
}
