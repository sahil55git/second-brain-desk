// Saved counter / register sales seen as BILLS: a multi-item or split-payment sale is several
// linked register rows (details.split.id); this puts them back together (pure, tested).
import type { CounterLine } from "./counterBill";
import { trackOf, type BillTrack } from "./counterTrack";

export interface SaleRow {
  id: string;
  date: string;
  kind: string;
  item: string | null;
  itemLabel: string | null;
  qty: number | null;
  unit: string | null;
  rateInr: number | null;
  amountInr: number;
  paymentMode: string;
  partyName: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  details?: unknown;
}

export interface BillLineView {
  item: string | null;
  label: string;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  amount: number;
}

export interface SavedBill {
  key: string;
  /** every register row of this bill (cancel removes them all) */
  ids: string[];
  /** first row: its id ends the bill number, as printed */
  firstId: string;
  no: string;
  date: string;
  createdAt: string;
  party: string | null;
  by: string | null;
  notes: string | null;
  /** a note the shop typed on the saved bill (separate from the automatic notes) */
  custNote: string;
  total: number;
  /** amount per payment mode, e.g. { CASH: 400, UPI: 220 } */
  modes: Record<string, number>;
  lines: BillLineView[];
  /** payment check and goods hand-over marks (first row) */
  track: BillTrack;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function meta(d: unknown): { split?: { id: string; i: number }; bill?: { line: number } } {
  const o = (d || {}) as Record<string, unknown>;
  const s = o.split as { id?: unknown; i?: unknown } | undefined;
  const b = o.bill as { line?: unknown } | undefined;
  return {
    split: s && typeof s.id === "string" ? { id: s.id, i: Number(s.i) || 0 } : undefined,
    bill: b && Number.isFinite(Number(b.line)) ? { line: Number(b.line) } : undefined,
  };
}

/** The counter's plain bill number (1, 2, 3 …) when the bill has one. */
export function billNoOf(d: unknown): string | null {
  const n = Number((d as { billNo?: unknown } | null)?.billNo);
  return Number.isInteger(n) && n > 0 ? String(n) : null;
}

/** The note typed on a saved bill (kept in the first row's details). */
export function custNoteOf(d: unknown): string {
  const n = (d as { custNote?: unknown } | null)?.custNote;
  return typeof n === "string" ? n : "";
}

/** Sale rows → bills, newest first. labelOf turns an item key into its name. */
export function groupBills(rows: SaleRow[], labelOf: (item: string | null, label: string | null) => string): SavedBill[] {
  const groups = new Map<string, SaleRow[]>();
  for (const r of rows) {
    if (r.kind !== "SALE") continue;
    const m = meta(r.details);
    const k = m.split ? m.split.id : r.id;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const bills: SavedBill[] = [];
  for (const [key, g] of Array.from(groups.entries())) {
    g.sort((a, b) => (meta(a.details).split?.i ?? 0) - (meta(b.details).split?.i ?? 0) || a.createdAt.localeCompare(b.createdAt));
    const first = g[0];
    const modes: Record<string, number> = {};
    const byLine = new Map<number, BillLineView>();
    g.forEach((r, idx) => {
      modes[r.paymentMode] = r2((modes[r.paymentMode] || 0) + r.amountInr);
      const ln = meta(r.details).bill?.line ?? idx + 1;
      const cur = byLine.get(ln);
      if (cur) {
        cur.amount = r2(cur.amount + r.amountInr);
        if (cur.qty == null && r.qty != null) Object.assign(cur, { qty: r.qty, unit: r.unit, rate: r.rateInr });
      } else {
        byLine.set(ln, { item: r.item, label: labelOf(r.item, r.itemLabel), qty: r.qty, unit: r.unit, rate: r.rateInr, amount: r.amountInr });
      }
    });
    bills.push({
      key,
      ids: g.map((r) => r.id),
      firstId: first.id,
      no: billNoOf(first.details) ?? first.id.slice(-6).toUpperCase(),
      date: first.date,
      createdAt: first.createdAt,
      party: first.partyName,
      by: first.createdByName,
      notes: first.notes,
      custNote: custNoteOf(first.details),
      total: r2(g.reduce((a, r) => a + r.amountInr, 0)),
      modes,
      track: trackOf(first.details),
      lines: Array.from(byLine.entries()).sort((a, b) => a[0] - b[0]).map(([, v]) => v),
    });
  }
  return bills.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Search a bill by bill number, customer, item, amount or note. */
export function billMatches(b: SavedBill, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const hay = [b.no, b.party || "", b.notes || "", b.custNote || "", b.by || "", String(b.total), ...b.lines.map((l) => l.label)].join(" ").toLowerCase();
  return s.split(/\s+/).every((w) => hay.includes(w));
}

/** A printed bill nobody has paid yet ("pay at the queue") is saved as a CASH row; in totals it is "PENDING", not cash. */
export const PENDING_MODE = "PENDING";
export const isBillPending = (b: { track?: { payPending?: boolean } }) => b.track?.payPending === true;

/** Day / range summary for the bills shown. Bills still waiting for their payment are counted apart as PENDING, not as cash. */
export function billsSummary(bills: SavedBill[]) {
  const modes: Record<string, number> = {};
  let total = 0;
  let kg = 0;
  for (const b of bills) {
    total += b.total;
    const pend = isBillPending(b);
    for (const [m, v] of Object.entries(b.modes)) {
      const key = pend && m === "CASH" ? PENDING_MODE : m;
      modes[key] = r2((modes[key] || 0) + v);
    }
    for (const l of b.lines) if (l.unit === "kg" && l.qty) kg += l.qty;
  }
  return { count: bills.length, total: r2(total), kg: Math.round(kg * 1000) / 1000, modes };
}

/** A saved bill back into counter lines (to edit it). Lines without a weight come back typed, weight 0. */
export function billToLines(b: SavedBill): CounterLine[] {
  return b.lines.map((l) => ({
    item: l.item || "other",
    label: l.label,
    qty: l.qty || 0,
    unit: l.unit || "kg",
    rate: l.rate || (l.qty ? r2(l.amount / l.qty) : 0),
    source: "typed" as const,
  }));
}
