"use client";

// Settings → 🧩 Features: every feature with an on / off switch (shop-wide).
import { useMemo, useState } from "react";
import { FEATURES, FEATURE_GROUPS, isOn, setFeature, type FeatureState } from "@/lib/features";
import { setFeaturesLocal, useFeatures } from "@/lib/useFeatures";

export default function FeaturesPanel() {
  const { state } = useFeatures();
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const cur: FeatureState = state || { off: [] };
  const save = async (next: FeatureState, note: string) => {
    setFeaturesLocal(next);
    const r = await fetch("/api/settings/app", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "features", data: next }) });
    setMsg(r.ok ? `${note} ✓ (saved for everyone)` : "Could not save — owner only");
    setTimeout(() => setMsg(null), 2500);
  };
  const flip = (key: string, on: boolean) => save(setFeature(cur, key, on), `${FEATURES.find((f) => f.key === key)?.title} ${on ? "on" : "off"}`);
  const all = (on: boolean, group?: string) => {
    let n = cur;
    for (const f of FEATURES) if (!group || f.group === group) n = setFeature(n, f.key, on);
    void save(n, on ? "Turned on" : "Turned off");
  };
  const list = useMemo(() => FEATURES.filter((f) => !q.trim() || `${f.title} ${f.desc}`.toLowerCase().includes(q.trim().toLowerCase())), [q]);
  const onCount = FEATURES.filter((f) => isOn(cur, f.key)).length;
  return (
    <section className="hub-card ft">
      <h3>🧩 Features <small className="hub-m">{onCount} of {FEATURES.length} on</small></h3>
      <p className="hub-m small">Switch off what you don&apos;t use — its pages, Insights tabs, quick links, chat commands and scheduled messages are hidden. Nothing is deleted; switching on brings it all back.</p>
      <div className="ft-bar">
        <input placeholder="Search features…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="hub-btn sm" onClick={() => all(true)}>All on</button>
        <button className="hub-btn sm" onClick={() => all(false)}>All off</button>
        {msg && <span className="hub-m">{msg}</span>}
      </div>
      {FEATURE_GROUPS.map((g) => {
        const fs = list.filter((f) => f.group === g.key);
        if (!fs.length) return null;
        return (
          <div key={g.key} className="ft-group">
            <div className="ft-gh"><b>{g.label}</b><span><button className="hub-btn sm" onClick={() => all(true, g.key)}>on</button> <button className="hub-btn sm" onClick={() => all(false, g.key)}>off</button></span></div>
            {fs.map((f) => {
              const on = isOn(cur, f.key);
              return (
                <label key={f.key} className={`ft-row${on ? " on" : ""}`}>
                  <span className="ft-i">{f.icon}</span>
                  <span className="ft-t"><b>{f.title}</b><small>{f.desc}</small></span>
                  <input type="checkbox" role="switch" className="ft-sw" checked={on} onChange={(e) => void flip(f.key, e.target.checked)} aria-label={f.title} />
                </label>
              );
            })}
          </div>
        );
      })}
      <style>{`
        .ft-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0 12px; }
        .ft-bar input { flex: 1; min-width: 160px; }
        .ft-group { margin-bottom: 14px; }
        .ft-gh { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .ft-row { display: grid; grid-template-columns: 32px minmax(0,1fr) auto; gap: 10px; align-items: center; padding: 8px 6px; border-bottom: 1px solid var(--h-line); cursor: pointer; opacity: .6; }
        .ft-row.on { opacity: 1; }
        .ft-i { font-size: 20px; text-align: center; }
        .ft-t { display: grid; } .ft-t small { opacity: .7; font-size: 12.5px; }
        .ft-sw { appearance: none; -webkit-appearance: none; width: 44px; height: 26px; border-radius: 13px; background: color-mix(in srgb, currentColor 22%, transparent); position: relative; cursor: pointer; transition: background .2s; }
        .ft-sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform .2s; box-shadow: 0 1px 3px rgb(0 0 0 / .3); }
        .ft-sw:checked { background: var(--h-g, #16a34a); }
        .ft-sw:checked::after { transform: translateX(18px); }
      `}</style>
    </section>
  );
}
