"use client";

import { useCallback, useEffect, useState } from "react";

interface Line { item: string; qty: number; unit: string; rate: number | null; amount: number | null }
interface Order { id: string; no: string; channel: string; phone: string | null; name: string | null; lines: Line[]; totalInr: number | null; status: string; note: string | null; createdAt: string }
const NEXT: Record<string, { to: string; label: string }> = { new: { to: "packed", label: "📦 Packed" }, packed: { to: "delivered", label: "✅ Delivered" } };
const TABS = [
  { k: "new", label: "🆕 New" },
  { k: "packed", label: "📦 Packed" },
  { k: "delivered", label: "✅ Delivered" },
  { k: "cancelled", label: "✕ Cancelled" },
];
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });

export default function OrdersDesk() {
  const [tab, setTab] = useState("new");
  const [rows, setRows] = useState<Order[]>([]);
  const [wa, setWa] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", text: "", note: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => fetch(`/api/shop-orders?status=${tab}`).then((r) => r.json()).then((j) => { setRows(j.data || []); setWa(!!j.wa); }).catch(() => {}), [tab]);
  useEffect(() => { void load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  const move = async (o: Order, status: string) => {
    const r = await fetch("/api/shop-orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: o.id, status }) }).then((x) => x.json()).catch(() => ({}));
    setMsg(`${o.no} → ${status}${r.told ? " · customer told on WhatsApp" : ""}`);
    void load();
  };
  const add = async () => {
    // "5 ltr mustard oil @170, 2 kg groundnut oil @190"
    const lines = f.text.split(/,|\n/).map((p) => {
      const m = /(\d+(?:\.\d+)?)\s*(kg|ltr|l|tin|pkt|btl)?\s+(.+?)(?:\s*@\s*(\d+(?:\.\d+)?))?$/i.exec(p.trim());
      return m ? { qty: Number(m[1]), unit: (m[2] || "kg").replace(/^l$/i, "ltr"), item: m[3].trim(), rate: m[4] ? Number(m[4]) : null } : null;
    }).filter(Boolean);
    const r = await fetch("/api/shop-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, lines }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `${j.data.no} added ✓` : j.error || "Could not add.");
    if (r.ok) { setF({ name: "", phone: "", text: "", note: "" }); setTab("new"); void load(); }
  };
  const saleLink = (o: Order) => `/register?say=${encodeURIComponent(o.lines.map((l) => `sold ${l.qty} ${l.unit} ${l.item}${l.rate ? ` rate ${l.rate}` : ""}${o.name ? ` to ${o.name}` : ""}`)[0] || "")}`;
  return (
    <div className="hub">
      <header className="hub-top">
        <div><h1>🛒 Orders</h1><div className="hub-m">WhatsApp and phone orders{wa ? " · WhatsApp connected" : " · WhatsApp not set up yet"}</div></div>
        <nav className="hub-links">{TABS.map((t) => <button key={t.k} className={`hub-btn${tab === t.k ? " primary" : ""}`} onClick={() => setTab(t.k)}>{t.label}</button>)}</nav>
      </header>
      {msg && <div className="hub-banner" role="status">{msg}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 12 }}>
        {rows.map((o) => (
          <section key={o.id} className="hub-card" style={{ display: "grid", gap: 6, margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{o.no} · {o.name || "Customer"}</b><small className="hub-m">{o.channel === "whatsapp" ? "💬" : "📞"} {when(o.createdAt)}</small></div>
            {o.phone && <a className="hub-m small" href={`https://wa.me/${o.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">+{o.phone}</a>}
            {o.lines.map((l, i) => <div key={i}>• {l.item} — <b>{l.qty} {l.unit}</b>{l.amount != null ? ` · ₹${l.amount}` : ""}</div>)}
            {o.totalInr != null && <div><b>Total ₹{o.totalInr.toLocaleString("en-IN")}</b></div>}
            {o.note && <small className="hub-m">{o.note}</small>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {NEXT[o.status] && <button className="hub-btn sm primary" onClick={() => void move(o, NEXT[o.status].to)}>{NEXT[o.status].label}</button>}
              {o.status !== "delivered" && o.status !== "cancelled" && <button className="hub-btn sm" onClick={() => void move(o, "cancelled")}>Cancel</button>}
              <a className="hub-btn sm" href={saleLink(o)}>📒 Sale entry</a>
            </div>
          </section>
        ))}
      </div>
      {!rows.length && <p className="hub-m">No orders here.</p>}
      <section className="hub-card" style={{ display: "grid", gap: 8, maxWidth: 640 }}>
        <h3>＋ Phone / counter order</h3>
        <input placeholder="Customer name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input placeholder="Phone (optional)" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <textarea rows={3} placeholder={"5 ltr mustard oil @170\n2 kg groundnut oil @190"} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
        <input placeholder="Note / address" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <button className="hub-btn primary" disabled={!f.text.trim()} onClick={() => void add()}>Add order</button>
      </section>
    </div>
  );
}
