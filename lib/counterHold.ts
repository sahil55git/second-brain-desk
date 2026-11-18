// Held counter bills: what is stored, checked before it reaches the database (pure, tested).
import { billSum, r2, r3, type BillAdjust, type CounterLine, type CounterPay, type SplitParts } from "./counterBill";

export interface HoldData {
  lines: CounterLine[];
  pay: CounterPay;
  party: string;
  adjust: BillAdjust;
  split?: SplitParts;
}

/** A device that opened a hold keeps it for this long; after that another device may take it over. */
export const HOLD_CLAIM_MS = 10 * 60 * 1000;

const SOURCES = ["steady", "moving", "typed"] as const;

export function parseHold(raw: unknown): { ok: true; data: HoldData; total: number; label: string } | { ok: false; error: string } {
  const o = (raw || {}) as Record<string, unknown>;
  if (!Array.isArray(o.lines) || !o.lines.length) return { ok: false, error: "Add at least one item before holding the bill." };
  if (o.lines.length > 40) return { ok: false, error: "Too many items in one bill (max 40)." };
  const lines: CounterLine[] = [];
  for (const r of o.lines) {
    const l = (r || {}) as Record<string, unknown>;
    const item = typeof l.item === "string" ? l.item.slice(0, 60) : "";
    const label = typeof l.label === "string" ? l.label.slice(0, 80) : item;
    const qty = Number(l.qty);
    const rate = Number(l.rate);
    if (!item || !Number.isFinite(qty) || qty < 0 || !Number.isFinite(rate) || rate < 0) return { ok: false, error: "A line in the bill is not valid." };
    const src = SOURCES.includes(l.source as (typeof SOURCES)[number]) ? (l.source as CounterLine["source"]) : "typed";
    const g = Number(l.grossKg);
    const t = Number(l.tareKg);
    lines.push({
      item,
      label,
      qty: r3(qty),
      unit: typeof l.unit === "string" ? l.unit.slice(0, 8) : "kg",
      rate: r2(rate),
      source: src,
      ...(Number.isFinite(g) && g > 0 ? { grossKg: r3(g) } : {}),
      ...(Number.isFinite(t) && t > 0 ? { tareKg: r3(t) } : {}),
      ...(Number(l.disc) > 0 ? { disc: r2(Number(l.disc)), discPct: l.discPct === true } : {}),
    });
  }
  const pay: CounterPay = o.pay === "UPI" || o.pay === "CREDIT" || o.pay === "SPLIT" ? o.pay : "CASH";
  const sp = (o.split || {}) as Record<string, unknown>;
  const split: SplitParts = {};
  for (const c of ["CASH", "UPI", "CREDIT"] as const) if (Number(sp[c]) > 0) split[c] = r2(Number(sp[c]));
  const party = typeof o.party === "string" ? o.party.trim().slice(0, 80) : "";
  const a = (o.adjust || {}) as Record<string, unknown>;
  const disc = Number(a.discount);
  const adjust: BillAdjust = { discount: Number.isFinite(disc) && disc > 0 ? r2(disc) : 0, pct: a.pct === true, roundOff: a.roundOff === true };
  const total = billSum(lines, adjust).net;
  const label = party || `${lines.length} item${lines.length > 1 ? "s" : ""}`;
  return { ok: true, data: { lines, pay, party, adjust, ...(pay === "SPLIT" ? { split } : {}) }, total, label };
}

/** May this device open (claim) a hold now? */
export function canClaim(h: { openedBy: string | null; openedAt: Date | string | null }, device: string, now = Date.now()): boolean {
  if (!h.openedBy || h.openedBy === device || !h.openedAt) return true;
  return now - new Date(h.openedAt).getTime() > HOLD_CLAIM_MS;
}
