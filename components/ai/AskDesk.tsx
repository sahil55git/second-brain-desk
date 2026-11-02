"use client";

// 💡 Ask your business: plain-word questions answered from a year of the shop's own records.
import { useState } from "react";
import { FeatureGate } from "@/lib/useFeatures";

const EXAMPLES = [
  "Which customer gave me the most sales in the last 3 months?",
  "How did October compare with September?",
  "Which oil is selling less than before?",
  "Who owes me the most and since when?",
  "Which supplier's seed gave the best yield?",
  "पिछले महीने सबसे ज़्यादा खर्चा किस पर हुआ?",
];

export default function AskDesk() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ q: string; a: string; err?: boolean }[]>([]);
  const ask = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text }) }).then((x) => x.json()).catch(() => ({ error: "Network problem." }));
    setLog((l) => [{ q: text, a: r.data?.answer || r.error || "No answer.", err: !r.data }, ...l]);
    setQ("");
    setBusy(false);
  };
  return (
    <FeatureGate k="askBusiness">
      <div className="hub">
        <header className="hub-top"><div><h1>💡 Ask your business</h1><div className="hub-m">Ask anything about your sales, customers, stock, udhaar or yields — answered from your own records (English, ಕನ್ನಡ, हिन्दी).</div></div></header>
        <section className="hub-card" style={{ display: "grid", gap: 8 }}>
          <textarea rows={2} value={q} placeholder="e.g. Which month of last year had the best groundnut oil sales?" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(q); } }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button className="hub-btn primary" disabled={busy || !q.trim()} onClick={() => void ask(q)}>{busy ? "Thinking…" : "Ask"}</button>
            {EXAMPLES.map((e) => <button key={e} className="hub-btn sm" disabled={busy} onClick={() => void ask(e)}>{e}</button>)}
          </div>
        </section>
        {log.map((x, i) => (
          <section key={i} className="hub-card">
            <div className="hub-m"><b>You:</b> {x.q}</div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 6, color: x.err ? "var(--h-r)" : undefined }}>{x.a}</div>
          </section>
        ))}
        <p className="hub-m small">Answers come from a summary of the last 13 months. Check important numbers in Reports before acting.</p>
      </div>
    </FeatureGate>
  );
}
