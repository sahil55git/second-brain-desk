"use client";

// ⚡ Rules: "if this happens, tell me / make a task". Checked morning, midday and evening; each
// alert is sent once. Templates to start fast; every number can be changed.
import { useCallback, useEffect, useState } from "react";
import { RULE_TEMPLATES, describeWhen, type Fired, type Rule, type RuleWhen } from "@/lib/rules";
import { FeatureGate } from "@/lib/useFeatures";

const FIELDS: Record<RuleWhen["t"], { k: string; label: string; num?: boolean }[]> = {
  udhaar: [{ k: "minInr", label: "₹ at least", num: true }, { k: "minDays", label: "for days", num: true }],
  stockDays: [{ k: "product", label: "Oil (or any)" }, { k: "maxDays", label: "within days", num: true }],
  cashShort: [{ k: "minInr", label: "short by ₹", num: true }],
  expenseMonth: [{ k: "category", label: "Expense" }, { k: "maxInr", label: "over ₹ this month", num: true }],
  mandiBelow: [{ k: "commodity", label: "Seed" }, { k: "perKg", label: "₹/kg or less", num: true }],
  saleBelow: [{ k: "item", label: "Item" }, { k: "rate", label: "below ₹", num: true }],
  noEntry: [{ k: "hours", label: "hours", num: true }],
};

export default function RulesDesk() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [now, setNow] = useState<Fired[] | null>(null);
  const [draft, setDraft] = useState<{ name: string; when: RuleWhen; alert: boolean; task: boolean; text: string } | null>(null);
  const load = useCallback(() => fetch("/api/rules").then((r) => r.json()).then((j) => setRules(j.data?.rules || [])).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const test = async () => { const j = await fetch("/api/rules?test=1").then((r) => r.json()).catch(() => ({})); setNow(j.data?.now || []); };
  const save = async () => {
    if (!draft) return;
    await fetch("/api/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: draft.name, when: draft.when, then: { alert: draft.alert, task: draft.task, text: draft.text || undefined } }) });
    setDraft(null); void load();
  };
  const patch = async (id: string, body: Record<string, unknown>) => { await fetch("/api/rules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) }); void load(); };
  const del = async (id: string) => { await fetch(`/api/rules?id=${id}`, { method: "DELETE" }); void load(); };
  return (
    <FeatureGate k="rules">
      <div className="hub">
        <header className="hub-top"><div><h1>⚡ Rules</h1><div className="hub-m">If this happens → tell me on Telegram / Discord and / or make a task. Checked at 7:35 am, 1:05 pm and 9:05 pm.</div></div>
          <nav className="hub-links"><button className="hub-btn" onClick={() => void test()}>▶ Check now</button></nav></header>
        {now && <section className="hub-card"><h3>Would fire now ({now.length})</h3>{now.length ? now.map((f) => <div key={f.key}>• <b>{f.name}</b>: {f.text}</div>) : <p className="hub-m">Nothing — all quiet.</p>}</section>}
        <section className="hub-card">
          <h3>Your rules</h3>
          {rules.map((r) => (
            <div key={r.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--h-line)", opacity: r.on ? 1 : 0.55 }}>
              <label><input type="checkbox" checked={r.on} onChange={(e) => void patch(r.id, { on: e.target.checked })} /> <b>{r.name}</b></label>
              <span className="hub-m small">If {describeWhen(r.when)} → {[r.then.alert && "alert", r.then.task && "task"].filter(Boolean).join(" + ")}</span>
              <button className="hub-btn sm" onClick={() => void del(r.id)}>Delete</button>
            </div>
          ))}
          {!rules.length && <p className="hub-m">No rules yet — start from one below.</p>}
        </section>
        <section className="hub-card">
          <h3>＋ New rule</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{RULE_TEMPLATES.map((t) => <button key={t.label} className="hub-btn sm" onClick={() => setDraft({ name: t.label, when: { ...t.when }, alert: true, task: false, text: "" })}>{t.label}</button>)}</div>
          {draft && (
            <div style={{ display: "grid", gap: 8, marginTop: 10, maxWidth: 560 }}>
              <label style={{ display: "grid", gap: 4 }}>Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{FIELDS[draft.when.t].map((f) => (
                <label key={f.k} style={{ display: "grid", gap: 4 }}>{f.label}
                  <input type={f.num ? "number" : "text"} value={String((draft.when as unknown as Record<string, unknown>)[f.k] ?? "")} onChange={(e) => setDraft({ ...draft, when: { ...draft.when, [f.k]: f.num ? Number(e.target.value) || 0 : e.target.value } as RuleWhen })} />
                </label>
              ))}</div>
              <div className="hub-m">If {describeWhen(draft.when)}</div>
              <label><input type="checkbox" checked={draft.alert} onChange={(e) => setDraft({ ...draft, alert: e.target.checked })} /> Send me an alert</label>
              <label><input type="checkbox" checked={draft.task} onChange={(e) => setDraft({ ...draft, task: e.target.checked })} /> Make a task for today</label>
              <label style={{ display: "grid", gap: 4 }}>Note to add (optional)<input value={draft.text} placeholder="Call and block credit" onChange={(e) => setDraft({ ...draft, text: e.target.value })} /></label>
              <div style={{ display: "flex", gap: 6 }}><button className="hub-btn primary" onClick={() => void save()}>Save rule</button><button className="hub-btn" onClick={() => setDraft(null)}>Cancel</button></div>
            </div>
          )}
        </section>
      </div>
    </FeatureGate>
  );
}
