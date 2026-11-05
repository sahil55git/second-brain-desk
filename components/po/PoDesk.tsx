"use client";

// 🧾 Purchase-order desk (owner): write an order with GST, terms and delivery details, save it as a
// draft or send it — WhatsApp, the phone's share sheet, a link the supplier opens (print / PDF), or
// print it yourself. Then follow it: what has arrived, what is still to come in ₹, late orders,
// edit (the revision goes up), duplicate, close short, cancel. Numbers come from lib/ops.ts and lib/po.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ShareButton from "@/components/share/ShareButton";
import type { BizData } from "@/lib/bizReports";
import { poProgress, type PoLine, type PoProgress } from "@/lib/ops";
import { GST_RATES, PO_UNITS, dmy, itemsFrom, lastRateFor, lineAmount, poMessage, poMoney, poSummary, poTotals, supplierPhones, waLink, type PoDoc, type ShopInfo } from "@/lib/po";
import { useFeatures } from "@/lib/useFeatures";
import PoDocument, { printPo } from "./PoDocument";
import "./po.css";

export interface PoRow {
  id: string; no: string; date: string; supplier: string; phone: string | null; dueDate: string | null; lines: PoLine[]; status: string;
  notes: string | null; terms: string | null; deliverTo: string | null; transport: string | null; rev: number; sentAt: string | null; sentVia: string | null; shareToken: string | null;
}
interface FormState { id: string | null; date: string; supplier: string; phone: string; dueDate: string; lines: PoLine[]; notes: string; terms: string; deliverTo: string; transport: string }

const rs = (n: number | null | undefined) => (n == null ? "–" : `₹${Math.round(n).toLocaleString("en-IN")}`);
const shift = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const STATUS: Record<string, string> = { draft: "📝 Draft", open: "⏳ Open", part: "🚚 Part received", done: "✅ Received", late: "⚠️ Late", closed: "🔒 Closed short", cancelled: "✕ Cancelled" };
const FILTERS: { k: string; label: string; test: (s: string) => boolean }[] = [
  { k: "active", label: "Active", test: (s) => s === "open" || s === "part" || s === "late" },
  { k: "late", label: "⚠️ Late", test: (s) => s === "late" },
  { k: "draft", label: "📝 Drafts", test: (s) => s === "draft" },
  { k: "done", label: "✅ Received", test: (s) => s === "done" || s === "closed" },
  { k: "all", label: "All", test: () => true },
];
const blankLine = (): PoLine => ({ item: "", qty: 0, unit: "kg", rate: 0, gst: 0 });
const DEF_KEY = "po-defaults-v1";
const readDefaults = (): { terms?: string; deliverTo?: string; transport?: string } => { try { return JSON.parse(localStorage.getItem(DEF_KEY) || "{}"); } catch { return {}; } };
const blank = (today: string): FormState => {
  const df = typeof window === "undefined" ? {} : readDefaults();
  return { id: null, date: today, supplier: "", phone: "", dueDate: shift(today, 3), lines: [blankLine()], notes: "", terms: df.terms || "", deliverTo: df.deliverTo || "", transport: df.transport || "" };
};
const toDoc = (r: PoRow): PoDoc => ({ no: r.no, rev: r.rev || 1, date: r.date, dueDate: r.dueDate, supplier: r.supplier, phone: r.phone, lines: r.lines, notes: r.notes, terms: r.terms, deliverTo: r.deliverTo, transport: r.transport, status: r.status });
const post = (method: string, body: unknown) => fetch("/api/orders", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export default function PoDesk({ d, today, onOrders }: { d: BizData; today: string; onOrders?: (rows: PoRow[]) => void }) {
  const feats = useFeatures();
  const told = useRef(onOrders);
  told.current = onOrders;
  const canLink = feats.on("poShare");
  const [orders, setOrders] = useState<PoRow[]>([]);
  const [shop, setShop] = useState<ShopInfo>({ name: "Mahadev Traders" });
  const [form, setForm] = useState<FormState>(() => blank(today));
  const [more, setMore] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [view, setView] = useState<PoRow | null>(null);
  const [filter, setFilter] = useState("active");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => fetch("/api/orders").then((r) => r.json()).then((j) => { const rows = (j.data || []) as PoRow[]; setOrders(rows); told.current?.(rows); setView((v) => (v ? rows.find((x) => x.id === v.id) || null : v)); }).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((j) => { const s = j.data; if (s) setShop({ name: s.businessName || "Mahadev Traders", gstin: s.gstin, address: s.address, phone: s.phone, email: s.email }); }).catch(() => {});
  }, []);

  const prog = useMemo(() => poProgress(orders, d, today), [orders, d, today]);
  const byId = useMemo(() => { const m: Record<string, PoProgress> = {}; for (const p of prog) m[p.id] = p; return m; }, [prog]);
  const rowOf = useMemo(() => { const m: Record<string, PoRow> = {}; for (const o of orders) m[o.id] = o; return m; }, [orders]);
  const sum = useMemo(() => poSummary(prog, today), [prog, today]);
  const phones = useMemo(() => supplierPhones(orders), [orders]);
  const suppliers = useMemo(() => Array.from(new Set(d.register.filter((e) => e.kind === "PURCHASE" && e.partyName).map((e) => e.partyName!.trim()).concat(d.purchases.map((p) => p.party?.name || "").filter(Boolean), orders.map((o) => o.supplier)))).sort(), [d, orders]);
  const known = useMemo(() => itemsFrom(d, form.supplier), [d, form.supplier]);
  const totals = useMemo(() => poTotals(form.lines.filter((l) => l.item.trim() && l.qty > 0)), [form.lines]);

  const flash = (ok: boolean, t: string) => { setMsg({ ok, t }); setTimeout(() => setMsg(null), 5000); };
  const origin = () => (typeof window === "undefined" ? "" : window.location.origin);
  const linkOf = (r: PoRow) => (canLink && r.shareToken ? `${origin()}/po/${r.shareToken}` : null);
  const messageOf = (r: PoRow) => poMessage(toDoc(r), shop, linkOf(r));
  const setLine = (i: number, p: Partial<PoLine>) => setForm((f) => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) }));
  const setSupplier = (v: string) => setForm((f) => ({ ...f, supplier: v, phone: f.phone || phones[norm(v)] || "" }));

  const save = async (status: "draft" | "open") => {
    setBusy(true);
    try {
      const body = { supplier: form.supplier, phone: form.phone, date: form.date, dueDate: form.dueDate, lines: form.lines, notes: form.notes, terms: form.terms, deliverTo: form.deliverTo, transport: form.transport, status };
      const r = form.id ? await post("PATCH", { id: form.id, edit: body }) : await post("POST", body);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return flash(false, j.error || "Could not save.");
      try { localStorage.setItem(DEF_KEY, JSON.stringify({ terms: form.terms, deliverTo: form.deliverTo, transport: form.transport })); } catch { /* ignore */ }
      const row = j.data as PoRow;
      flash(true, `${row.no} ${status === "draft" ? "saved as a draft" : form.id ? "updated" : "saved"} ✓`);
      setForm(blank(today));
      setMore(false);
      await load();
      if (status === "open") setView({ ...row, lines: row.lines });
    } finally { setBusy(false); }
  };
  const startEdit = (r: PoRow) => {
    setForm({ id: r.id, date: r.date, supplier: r.supplier, phone: r.phone || "", dueDate: r.dueDate || "", lines: r.lines.map((l) => ({ ...l, gst: l.gst || 0 })), notes: r.notes || "", terms: r.terms || "", deliverTo: r.deliverTo || "", transport: r.transport || "" });
    setMore(!!(r.terms || r.deliverTo || r.transport || r.notes));
    setView(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const duplicate = (r: PoRow) => {
    setForm({ id: null, date: today, supplier: r.supplier, phone: r.phone || "", dueDate: shift(today, 3), lines: r.lines.map((l) => ({ ...l, gst: l.gst || 0 })), notes: r.notes || "", terms: r.terms || "", deliverTo: r.deliverTo || "", transport: r.transport || "" });
    setMore(!!(r.terms || r.deliverTo || r.transport || r.notes));
    flash(true, `Copied ${r.no} into the form — change what you need and save.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const patch = async (body: Record<string, unknown>, ok?: string) => {
    const r = await post("PATCH", body);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { flash(false, j.error || "Could not change it."); return null; }
    if (ok) flash(true, ok);
    await load();
    return j.data as PoRow;
  };
  const del = async (r: PoRow) => {
    if (!window.confirm(`Delete ${r.no} for ${r.supplier}? This cannot be undone.`)) return;
    const res = await fetch(`/api/orders?id=${encodeURIComponent(r.id)}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return flash(false, j.error || "Could not delete.");
    flash(true, `${r.no} deleted.`);
    setView(null);
    await load();
  };
  const makeLink = async (r: PoRow) => {
    const row = await patch({ id: r.id, share: "create" });
    if (!row?.shareToken) return;
    const url = `${origin()}/po/${row.shareToken}`;
    try { await navigator.clipboard.writeText(url); flash(true, "Link made and copied. Anyone with it can view this order."); } catch { flash(true, "Link made — copy it from the card."); }
  };
  const copyLink = async (r: PoRow) => { const l = linkOf(r); if (!l) return; try { await navigator.clipboard.writeText(l); flash(true, "Link copied."); } catch { flash(false, "Could not copy — select the link and copy it."); } };
  const revoke = async (r: PoRow) => { if (window.confirm("Switch this link off? The supplier will no longer be able to open it.")) await patch({ id: r.id, share: "revoke" }, "Link switched off."); };
  const sentNote = (r: PoRow) => (r.sentAt ? `Sent ${dmy(r.sentAt.slice(0, 10))}${r.sentVia ? ` (${r.sentVia})` : ""}` : r.status === "draft" ? "Not sent" : "Not marked as sent");

  const list = prog.filter((p) => (FILTERS.find((x) => x.k === filter) || FILTERS[0]).test(p.status) && (!q.trim() || `${p.no} ${p.supplier} ${p.lines.map((l) => l.item).join(" ")}`.toLowerCase().includes(q.trim().toLowerCase())));

  const actions = (r: PoRow, p: PoProgress, inModal = false) => {
    const wa = waLink(r.phone, messageOf(r));
    return (
      <div className="po-acts">
        {p.status !== "cancelled" && (
          <>
            <a className="hub-btn sm" href={wa} target="_blank" rel="noreferrer" onClick={() => void patch({ id: r.id, markSent: true, via: "whatsapp" })}>🟢 WhatsApp</a>
            <ShareButton text={messageOf(r)} title={`Purchase order ${r.no}`} url={false} label="📤 Share" className="hub-btn sm" area={inModal ? "#po-sheet" : undefined} />
          </>
        )}
        {!inModal && <button className="hub-btn sm" onClick={() => setView(r)}>📄 View / print</button>}
        {inModal && <button className="hub-btn sm" onClick={printPo}>🖨️ Print / PDF</button>}
        {r.status !== "cancelled" && !r.sentAt && r.status !== "draft" && <button className="hub-btn sm" onClick={() => void patch({ id: r.id, markSent: true, via: "share" }, "Marked as sent.")}>✔ Mark sent</button>}
        {r.status === "draft" && <button className="hub-btn sm primary" onClick={() => void patch({ id: r.id, status: "open" }, `${r.no} is now open.`)}>▶ Activate</button>}
        {r.status !== "cancelled" && <button className="hub-btn sm" onClick={() => startEdit(r)}>✏️ Edit</button>}
        <button className="hub-btn sm" onClick={() => duplicate(r)}>🔁 Copy</button>
        {(p.status === "open" || p.status === "part" || p.status === "late") && p.pct > 0 && <button className="hub-btn sm" onClick={() => void patch({ id: r.id, status: "closed" }, `${r.no} closed — the rest will not come.`)}>🔒 Close short</button>}
        {r.status === "closed" && <button className="hub-btn sm" onClick={() => void patch({ id: r.id, status: "open" }, `${r.no} reopened.`)}>Reopen</button>}
        {r.status === "cancelled" ? <button className="hub-btn sm" onClick={() => void patch({ id: r.id, status: "open" }, `${r.no} reopened.`)}>Reopen</button> : p.status !== "done" && <button className="hub-btn sm" onClick={() => void patch({ id: r.id, status: "cancelled" }, `${r.no} cancelled.`)}>✕ Cancel</button>}
        {(r.status === "draft" || r.status === "cancelled") && <button className="hub-btn sm" onClick={() => void del(r)}>🗑 Delete</button>}
      </div>
    );
  };

  return (
    <>
      <section className="hub-card">
        <h3>{form.id ? `✏️ Editing ${orders.find((o) => o.id === form.id)?.no || "order"}` : "＋ New purchase order"}</h3>
        <div className="ins-row">
          <label>Supplier <input list="po-sup" value={form.supplier} onChange={(e) => setSupplier(e.target.value)} /></label>
          <datalist id="po-sup">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
          <label>WhatsApp no. <input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label>Deliver by <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
        </div>
        <datalist id="po-items">{known.map((k) => <option key={k.item} value={k.item} />)}</datalist>
        {form.lines.map((l, i) => {
          const lr = form.supplier && l.item ? lastRateFor(d, form.supplier, l.item) : null;
          return (
            <div key={i} className="po-line">
              <label>Item <input list="po-items" value={l.item} placeholder="Groundnut seed" onChange={(e) => setLine(i, { item: e.target.value })} /></label>
              <label>Qty <input type="number" inputMode="decimal" value={l.qty || ""} onChange={(e) => setLine(i, { qty: Number(e.target.value) || 0 })} /></label>
              <label>Unit <select value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })}>{PO_UNITS.map((u) => <option key={u}>{u}</option>)}</select></label>
              <label>Rate ₹ <input type="number" inputMode="decimal" value={l.rate || ""} onChange={(e) => setLine(i, { rate: Number(e.target.value) || 0 })} />
                <span className="po-hint">{lr ? <button type="button" className="hub-btn sm" onClick={() => setLine(i, { rate: lr.rate })}>Last ₹{lr.rate} ({dmy(lr.date)}) — use</button> : ""}</span>
              </label>
              <label>GST <select value={l.gst || 0} onChange={(e) => setLine(i, { gst: Number(e.target.value) })}>{GST_RATES.map((g) => <option key={g} value={g}>{g}%</option>)}</select>
                <span className="po-amt">{l.qty && l.rate ? rs(lineAmount(l)) : ""}{form.lines.length > 1 && <> <button type="button" className="hub-btn sm" aria-label="Remove this item" onClick={() => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) })}>✕</button></>}</span>
              </label>
            </div>
          );
        })}
        <div className="ins-row">
          <button className="hub-btn sm" onClick={() => setForm({ ...form, lines: [...form.lines, blankLine()] })}>＋ Item</button>
          <button className="hub-btn sm" onClick={() => setMore((m) => !m)}>{more ? "▲ Fewer details" : "▼ Terms, delivery, notes"}</button>
        </div>
        {more && (
          <div className="po-more">
            <label>Terms <input value={form.terms} placeholder="Payment within 7 days of delivery" onChange={(e) => setForm({ ...form, terms: e.target.value })} /></label>
            <label>Deliver to <input value={form.deliverTo} placeholder="Godown address, if not the shop" onChange={(e) => setForm({ ...form, deliverTo: e.target.value })} /></label>
            <label>Transport <input value={form.transport} placeholder="Supplier's truck / our tempo" onChange={(e) => setForm({ ...form, transport: e.target.value })} /></label>
            <label>Note <input value={form.notes} placeholder="Sample to match, moisture limit…" onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          </div>
        )}
        {totals.subtotal > 0 && <div className="po-total"><b>Total {rs(totals.total)}</b>{totals.tax > 0 && <span className="hub-m"> (items {rs(totals.subtotal)} + GST {rs(totals.tax)})</span>}</div>}
        <div className="ins-row">
          <button className="hub-btn primary" disabled={busy} onClick={() => void save("open")}>{form.id ? "Save changes" : "Save order"}</button>
          {(!form.id || orders.find((o) => o.id === form.id)?.status === "draft") && <button className="hub-btn" disabled={busy} onClick={() => void save("draft")}>Save as draft</button>}
          {form.id && <button className="hub-btn" onClick={() => { setForm(blank(today)); setMore(false); }}>Cancel edit</button>}
          {msg && <span className={`hub-m ${msg.ok ? "" : "bad"}`} role="status">{msg.t}</span>}
        </div>
        <p className="hub-m small">After saving you can send it: WhatsApp, any app, or a link the supplier opens and prints. When the goods come, enter the purchase as usual with the same supplier name — the order fills itself. Editing an order you already sent raises its revision number.</p>
      </section>

      <div className="po-sum">
        <div><b>{sum.open}</b><small>open orders</small></div>
        <div className={sum.late ? "bad" : ""}><b>{sum.late}</b><small>late</small></div>
        <div><b>{sum.dueThisWeek}</b><small>due this week</small></div>
        <div><b>{rs(sum.pendingValue)}</b><small>still to come</small></div>
        {sum.drafts > 0 && <div><b>{sum.drafts}</b><small>drafts</small></div>}
      </div>
      <div className="po-filter">
        {FILTERS.map((x) => <button key={x.k} className={`hub-btn sm${filter === x.k ? " primary" : ""}`} onClick={() => setFilter(x.k)}>{x.label}</button>)}
        <input type="search" placeholder="Search supplier, item or PO no." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="ins-cards">
        {list.length === 0 && <p className="hub-m">{orders.length ? "Nothing here. Try another filter." : "No purchase orders yet — make the first one above."}</p>}
        {list.map((p) => {
          const r = rowOf[p.id];
          if (!r) return null;
          const m = poMoney(p);
          const link = linkOf(r);
          return (
            <div key={p.id} className={`hub-card ins-run ${p.status === "late" ? "out" : p.status === "done" ? "ok" : p.status === "part" ? "low" : ""}`}>
              <div className="ins-run-h"><b>{p.no}{r.rev > 1 ? ` · rev ${r.rev}` : ""} · {p.supplier}</b><span className="ins-chip">{STATUS[p.status]}</span></div>
              <small className="hub-m">{dmy(p.date)}{p.dueDate ? ` → due ${dmy(p.dueDate)}` : ""}{p.lateDays ? ` · ${p.lateDays} days late` : ""}{r.phone ? ` · ${r.phone}` : ""}</small>
              <span className="po-sent">{sentNote(r)}</span>
              {p.status !== "draft" && p.status !== "cancelled" && (
                <small className="hub-m">Ordered {rs(m.ordered)} · received {rs(m.received)} · still to come {rs(m.pending)}{m.extraPaid > 0 && <b className="bad"> · billed {rs(m.extraPaid)} above the ordered rate</b>}</small>
              )}
              {p.status === "draft" && <small className="hub-m">Order value {rs(m.ordered)}</small>}
              {p.lines.map((l) => (
                <div key={l.item} className="ins-bar"><span className="n">{l.item}</span><span className="b"><i style={{ width: `${Math.min(100, (l.got / l.qty) * 100)}%` }} /></span><span className="v">{l.got}/{l.qty} {l.unit}</span>{l.avgRate != null && l.rate > 0 && l.avgRate > l.rate && <small className="bad">billed ₹{l.avgRate} vs ordered ₹{l.rate}</small>}</div>
              ))}
              {r.notes && <small className="hub-m">📝 {r.notes}</small>}
              {actions(r, p)}
              {canLink && p.status !== "cancelled" && (
                <div className="po-link">
                  {link ? (
                    <>
                      <span>🔗 Supplier link on</span>
                      <button className="hub-btn sm" onClick={() => void copyLink(r)}>Copy link</button>
                      <button className="hub-btn sm" onClick={() => void revoke(r)}>Switch off</button>
                      <code>{link}</code>
                    </>
                  ) : <button className="hub-btn sm" onClick={() => void makeLink(r)}>🔗 Make a link for the supplier</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {view && byId[view.id] && (
        <div className="po-modal" role="dialog" aria-modal="true" aria-label={`Purchase order ${view.no}`} onClick={(e) => { if (e.target === e.currentTarget) setView(null); }}>
          <div className="po-modal-in">
            <div className="po-bar">
              <button className="hub-btn sm" onClick={() => setView(null)}>✕ Close</button>
              {actions(rowOf[view.id] || view, byId[view.id], true)}
            </div>
            <PoDocument po={toDoc(rowOf[view.id] || view)} shop={shop} />
          </div>
        </div>
      )}
    </>
  );
}
