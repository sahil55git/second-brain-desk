// 🧾 Purchase-order desk logic: clean what the form sends, GST totals, the message and WhatsApp link
// for sharing an order, last rate paid to a supplier, order value / pending value, and the due-date
// alerts. Pure — tested in lib/__tests__/po.test.ts. What has arrived against an order is worked out
// in lib/ops.ts (poProgress); this file only adds the paperwork around it.
import type { BizData } from "./bizReports";
import { amountInWords } from "./money";
import { receipts, type PoLine, type PoProgress } from "./ops";

const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string | null | undefined) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const rs = (n: number) => `₹${r2(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const dmy = (d: string | null | undefined) => (d ? d.split("-").reverse().join("-") : "–");
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(`${v}T00:00:00Z`));
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const gap = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export const PO_UNITS = ["kg", "qtl", "ton", "ltr", "tin", "bag", "pcs"];
export const GST_RATES = [0, 5, 12, 18];

/** An order as shown on the printed / shared document. */
export interface PoDoc {
  no: string; rev: number; date: string; dueDate: string | null; supplier: string; phone: string | null;
  lines: PoLine[]; notes: string | null; terms: string | null; deliverTo: string | null; transport: string | null; status: string;
}
export interface ShopInfo { name: string; gstin?: string | null; address?: string | null; phone?: string | null; email?: string | null }

// ---------------------------------------------------------------- form → clean data
export interface PoInput {
  supplier: string; phone: string | null; date: string; dueDate: string | null; lines: PoLine[];
  notes: string | null; terms: string | null; deliverTo: string | null; transport: string | null; status: "draft" | "open";
}
export function cleanPoInput(b: Record<string, unknown>): { ok: true; data: PoInput } | { ok: false; error: string } {
  const supplier = str(b.supplier, 120);
  const lines: PoLine[] = (Array.isArray(b.lines) ? b.lines : [])
    .map((l: Record<string, unknown>) => ({
      item: str(l?.item, 80),
      qty: Math.round((Number(l?.qty) || 0) * 1000) / 1000,
      unit: str(l?.unit, 10) || "kg",
      rate: Math.max(0, r2(Number(l?.rate) || 0)),
      gst: Math.min(28, Math.max(0, Number(l?.gst) || 0)),
    }))
    .filter((l) => l.item && l.qty > 0)
    .slice(0, 20);
  if (!supplier) return { ok: false, error: "Who is the supplier?" };
  if (!lines.length) return { ok: false, error: "Add at least one item with a quantity." };
  if (!isDate(b.date)) return { ok: false, error: "The order date is not valid." };
  const due = isDate(b.dueDate) ? b.dueDate : null;
  if (due && due < b.date) return { ok: false, error: "The delivery date is before the order date." };
  const opt = (v: unknown, n: number) => str(v, n) || null;
  return { ok: true, data: { supplier, phone: opt(b.phone, 20), date: b.date, dueDate: due, lines, notes: opt(b.notes, 300), terms: opt(b.terms, 400), deliverTo: opt(b.deliverTo, 200), transport: opt(b.transport, 80), status: b.status === "draft" ? "draft" : "open" } };
}

// ---------------------------------------------------------------- money
export interface PoTotals { subtotal: number; taxRows: { rate: number; taxable: number; tax: number }[]; tax: number; total: number; words: string }
/** Each line is qty × rate (the rate is per the line's own unit); GST is grouped by rate. */
export function poTotals(lines: PoLine[]): PoTotals {
  const by: Record<number, number> = {};
  let subtotal = 0;
  for (const l of lines) { const amt = l.qty * l.rate; subtotal += amt; const g = l.gst || 0; by[g] = (by[g] || 0) + amt; }
  const taxRows = Object.keys(by).map(Number).sort((a, b) => a - b).filter((g) => g > 0).map((rate) => ({ rate, taxable: r2(by[rate]), tax: r2((by[rate] * rate) / 100) }));
  const tax = r2(taxRows.reduce((a, t) => a + t.tax, 0));
  const total = r2(subtotal + tax);
  return { subtotal: r2(subtotal), taxRows, tax, total, words: amountInWords(total) };
}
export const lineAmount = (l: PoLine) => r2(l.qty * l.rate);

export interface PoMoney { ordered: number; received: number; pending: number; extraPaid: number }
/** ₹ ordered, ₹ received so far (at the rate actually billed), ₹ still to come, and what was billed above the ordered rate. */
export function poMoney(p: PoProgress): PoMoney {
  let ordered = 0, received = 0, pending = 0, extra = 0;
  for (const l of p.lines) {
    const billed = l.avgRate ?? l.rate;
    ordered += l.qty * l.rate; received += l.got * billed; pending += l.left * l.rate; extra += l.got * (billed - l.rate);
  }
  return { ordered: r2(ordered), received: r2(received), pending: r2(pending), extraPaid: r2(extra) };
}

// ---------------------------------------------------------------- sharing
/** 10-digit Indian mobile → 91XXXXXXXXXX; other numbers kept as digits; "" when there is none. */
export function waNumber(phone: string | null | undefined): string {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  return d.length >= 11 ? d : "";
}
export function waLink(phone: string | null | undefined, text: string): string {
  const n = waNumber(phone);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
/** The message sent to the supplier. */
export function poMessage(po: PoDoc, shop: ShopInfo, link?: string | null): string {
  const t = poTotals(po.lines);
  const out = [
    `*Purchase order ${po.no}*${po.rev > 1 ? ` (revised, rev ${po.rev})` : ""}`,
    `${shop.name || "Our shop"}${shop.address ? `, ${shop.address}` : ""}`,
    `To: ${po.supplier}`,
    `Date: ${dmy(po.date)}${po.dueDate ? ` · Deliver by ${dmy(po.dueDate)}` : ""}`,
    "",
    ...po.lines.map((l) => `• ${l.item}: ${l.qty} ${l.unit}${l.rate ? ` @ ${rs(l.rate)} = ${rs(lineAmount(l))}` : ""}${l.gst ? ` (+${l.gst}% GST)` : ""}`),
  ];
  if (t.subtotal > 0) out.push("", `*Total ${rs(t.total)}*${t.tax ? ` (incl. GST ${rs(t.tax)})` : ""}`);
  if (po.deliverTo) out.push(`Deliver to: ${po.deliverTo}`);
  if (po.transport) out.push(`Transport: ${po.transport}`);
  if (po.terms) out.push(`Terms: ${po.terms}`);
  if (po.notes) out.push(`Note: ${po.notes}`);
  if (link) out.push("", `View / print this order: ${link}`);
  out.push("", "Please confirm by reply. Thank you.");
  return out.join("\n");
}

// ---------------------------------------------------------------- hints while filling the form
/** The rate paid to this supplier for this item the last time, from purchases. */
export function lastRateFor(d: BizData, supplier: string, item: string): { rate: number; date: string } | null {
  const s = norm(supplier), w = norm(item);
  if (!s || !w) return null;
  let best: { rate: number; date: string } | null = null;
  for (const r of receipts(d)) {
    if (r.supplier !== s || !r.rate) continue;
    if (!(r.item === w || r.item.includes(w) || w.includes(r.item))) continue;
    if (!best || r.date > best.date) best = { rate: Math.round(r.rate * 100) / 100, date: r.date };
  }
  return best;
}
/** Items bought from this supplier before (most recent first) — to pick from while adding lines. */
export function itemsFrom(d: BizData, supplier: string, limit = 12): { item: string; rate: number | null; date: string }[] {
  const s = norm(supplier);
  if (!s) return [];
  const seen: Record<string, { item: string; rate: number | null; date: string }> = {};
  for (const r of receipts(d)) {
    if (r.supplier !== s) continue;
    const k = r.item;
    if (!seen[k] || r.date > seen[k].date) seen[k] = { item: r.item, rate: r.rate ? Math.round(r.rate * 100) / 100 : null, date: r.date };
  }
  return Object.values(seen).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit);
}
/** The WhatsApp number last used for each supplier (by lower-case name). */
export function supplierPhones(orders: { supplier: string; phone?: string | null; date: string }[]): Record<string, string> {
  const out: Record<string, { phone: string; date: string }> = {};
  for (const o of orders) {
    const p = (o.phone || "").trim();
    if (!p) continue;
    const k = norm(o.supplier);
    if (!out[k] || o.date >= out[k].date) out[k] = { phone: p, date: o.date };
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.phone]));
}

// ---------------------------------------------------------------- the desk's summary and alerts
export interface PoSummary { open: number; late: number; dueThisWeek: number; drafts: number; pendingValue: number }
export function poSummary(prog: PoProgress[], today: string): PoSummary {
  let open = 0, late = 0, dueThisWeek = 0, drafts = 0, pendingValue = 0;
  for (const p of prog) {
    if (p.status === "draft") { drafts++; continue; }
    if (p.status === "open" || p.status === "part" || p.status === "late") {
      open++;
      pendingValue += poMoney(p).pending;
      if (p.status === "late") late++;
      else if (p.dueDate && p.dueDate >= today && p.dueDate <= addDays(today, 7)) dueThisWeek++;
    }
  }
  return { open, late, dueThisWeek, drafts, pendingValue: r2(pendingValue) };
}

const toGo = (p: PoProgress) => p.lines.filter((l) => l.left > 0).map((l) => `${l.left} ${l.unit} ${l.item}`).join(", ");
/** Lines for the chat's "needs attention" list: late orders, orders due today / tomorrow, drafts never sent. */
export function poAlerts(prog: PoProgress[], today: string, soonDays = 1): string[] {
  const out: { rank: number; text: string }[] = [];
  for (const p of prog) {
    if (p.status === "late") out.push({ rank: 0, text: `⚠️ ${p.no} · ${p.supplier}: ${p.lateDays} day${p.lateDays === 1 ? "" : "s"} late — still to come: ${toGo(p)}` });
    else if ((p.status === "open" || p.status === "part") && p.dueDate && p.dueDate >= today && p.dueDate <= addDays(today, soonDays)) {
      out.push({ rank: 1, text: `📅 ${p.no} · ${p.supplier}: due ${p.dueDate === today ? "today" : dmy(p.dueDate)} — still to come: ${toGo(p)}` });
    } else if (p.status === "draft" && gap(p.date, today) >= 2) out.push({ rank: 2, text: `📝 ${p.no} · ${p.supplier}: still a draft, not sent (${gap(p.date, today)} days)` });
  }
  return out.sort((a, b) => a.rank - b.rank).map((x) => x.text);
}
