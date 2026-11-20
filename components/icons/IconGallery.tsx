"use client";

// /icons — every icon in the library, grouped, with its name and id. Tap one to copy its id
// (use as <MillIcon id="…"/> or pick it on a Quick-links tile). Search by English or Kannada name.
import { useMemo, useState } from "react";
import MillIcon from "@/components/icons/MillIcon";
import { ICON_GROUPS, iconRows, searchIcons } from "@/lib/millIcons";

export default function IconGallery() {
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState("");
  const [dark, setDark] = useState(false);
  const rows = useMemo(() => searchIcons(iconRows(), q), [q]);
  const copy = async (id: string) => {
    try { await navigator.clipboard.writeText(id); } catch { /* clipboard blocked: the id is still shown */ }
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? "" : c)), 1500);
  };
  return (
    <div style={{ maxWidth: 1000 }}>
      <div className="go-chips" style={{ marginBottom: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search icons (oil, ಎಣ್ಣೆ, barrel…)" style={{ flex: 1, minWidth: 180, padding: "8px 10px", fontSize: 15 }} aria-label="Search icons" />
        <button className="hub-btn" onClick={() => setDark((d) => !d)}>{dark ? "☀️ Light" : "🌙 Dark"} background</button>
      </div>
      {ICON_GROUPS.map((g) => {
        const list = rows.filter((r) => r.group === g.id);
        if (!list.length) return null;
        return (
          <section key={g.id} className="hub-card" style={{ marginBottom: 14 }}>
            <h2 style={{ margin: "0 0 2px", fontSize: 18 }}>{g.title} · <span lang="kn">{g.kn}</span></h2>
            <div className="hub-m small" style={{ marginBottom: 10 }}>{g.note}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 10 }}>
              {list.map((r) => (
                <button key={r.id} onClick={() => copy(r.id)} className="hub-btn" title={`Copy id: ${r.id}`}
                  style={{ flexDirection: "column", alignItems: "center", padding: 10, gap: 6, textAlign: "center", background: dark ? "#1f2937" : undefined, color: dark ? "#e5e7eb" : undefined }}>
                  <MillIcon id={r.id} size={52} />
                  <b style={{ fontSize: 13 }}>{r.name}</b>
                  <span lang="kn" style={{ fontSize: 12, opacity: 0.8 }}>{r.kn}</span>
                  <code style={{ fontSize: 11, opacity: 0.7 }}>{copied === r.id ? "✓ copied" : r.id}</code>
                  {r.candidate && <span className="hub-m small">option</span>}
                  {r.hint && <span className="hub-m small">{r.hint}</span>}
                </button>
              ))}
            </div>
          </section>
        );
      })}
      {!rows.length && <div className="hub-banner">No icon matches “{q}”.</div>}
      <div className="hub-m small">To add an icon: add one entry to <code>ICONS</code> in <code>lib/millIcons.ts</code> (48×48 outline, round caps); it shows up here and in the tile picker.</div>
    </div>
  );
}
