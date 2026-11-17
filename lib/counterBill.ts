// Weigh & Bill counter: the bill itself, as plain data (no React, no network) so it can be tested.
// A line is one item weighed (or counted) at a rate; the bill is saved as ONE register SALE entry
// with these lines, so cash, udhaar, stock and Daily Closing work exactly as for any other sale.

export interface CounterLine {
  /** register catalog key, e.g. "karadi" */
  item: string;
  /** what the customer reads, e.g. "Karadi" */
  label: string;
  /** kg (or pieces when unit is "pcs") */
  qty: number;
  unit: string;
  /** ₹ per unit */
  rate: number;
  /** how the quantity was taken: from the scale (steady / moving) or typed by hand */
  source: "steady" | "moving" | "typed";
  /** gross scale reading and container weight taken off, when it came from the scale */
  grossKg?: number;
  tareKg?: number;
  /** item-wise discount: ₹ off this line, or percent when discPct */
  disc?: number;
  discPct?: boolean;
}

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** qty × rate, before any discount */
export const lineGross = (l: Pick<CounterLine, "qty" | "rate">) => r2(Math.max(0, l.qty) * Math.max(0, l.rate));
/** the ₹ taken off this line by its own discount */
export const lineDisc = (l: Pick<CounterLine, "qty" | "rate" | "disc" | "discPct">) => {
  const g = lineGross(l);
  const d = Math.max(0, l.disc || 0);
  return r2(Math.min(g, l.discPct ? (g * Math.min(d, 100)) / 100 : d));
};
/** what the line costs after its own discount */
export const lineAmount = (l: Pick<CounterLine, "qty" | "rate" | "disc" | "discPct">) => r2(lineGross(l) - lineDisc(l));

export function billTotal(lines: CounterLine[]): number {
  return r2(lines.reduce((a, l) => a + lineAmount(l), 0));
}

export function billKg(lines: CounterLine[]): number {
  return r3(lines.filter((l) => l.unit === "kg").reduce((a, l) => a + l.qty, 0));
}

/** Change to give back; negative = the customer still owes that much. */
export function changeDue(total: number, received: number): number {
  return r2(received - total);
}

/** Adds a weighed line; the same item at the same rate is a NEW line (each weighing is its own record). */
export function addLine(lines: CounterLine[], l: CounterLine): CounterLine[] {
  if (!(l.qty > 0)) return lines;
  return [...lines, { ...l, qty: r3(l.qty), rate: r2(l.rate) }];
}

export function updateLine(lines: CounterLine[], i: number, patch: Partial<Pick<CounterLine, "qty" | "rate" | "disc" | "discPct">>): CounterLine[] {
  return lines.map((l, j) => {
    if (j !== i) return l;
    const next = { ...l, ...patch };
    // a typed quantity is no longer the scale's reading
    if (patch.qty != null && patch.qty !== l.qty) next.source = "typed";
    next.qty = r3(Math.max(0, next.qty));
    next.rate = r2(Math.max(0, next.rate));
    if (next.disc != null) next.disc = r2(Math.max(0, next.disc));
    if (!next.disc) {
      delete next.disc;
      delete next.discPct;
    }
    return next;
  });
}

export type CounterPay = "CASH" | "UPI" | "CREDIT" | "SPLIT";
/** amounts per channel when the bill is paid partly by cash, UPI and udhaar */
export type SplitParts = Partial<Record<"CASH" | "UPI" | "CREDIT", number>>;

/** Cash handed back: received minus the cash part of the bill (never below zero). */
export function cashReturn(cashDue: number, received: number): number {
  return received > cashDue ? r2(received - cashDue) : 0;
}

export interface BillAdjust {
  /** discount on the whole bill: ₹ amount, or percent when pct is true */
  discount?: number;
  pct?: boolean;
  /** round the bill to the nearest rupee */
  roundOff?: boolean;
}

export interface BillSum {
  gross: number;
  discount: number;
  roundOff: number;
  net: number;
  /** each line's share of the net, in paise-exact rupees (adds up to net) */
  amounts: number[];
}

/** Gross → discount → round-off → net, with the net spread over the lines (each line keeps qty and rate). */
export function billSum(lines: CounterLine[], a: BillAdjust = {}): BillSum {
  const gross = billTotal(lines);
  const raw = Math.max(0, a.discount || 0);
  const discount = r2(Math.min(gross, a.pct ? (gross * Math.min(raw, 100)) / 100 : raw));
  const afterDisc = r2(gross - discount);
  const net = a.roundOff ? Math.round(afterDisc) : afterDisc;
  const roundOff = r2(net - afterDisc);
  const base = lines.map(lineAmount);
  let amounts = base;
  if (gross > 0 && net !== gross) {
    // spread the change in paise, by each line's share; the last line takes the rounding remainder
    const pNet = Math.round(net * 100);
    const pGross = Math.round(gross * 100);
    let used = 0;
    amounts = base.map((b, i) => {
      if (i === base.length - 1) return (pNet - used) / 100;
      const p = Math.floor((Math.round(b * 100) * pNet) / pGross);
      used += p;
      return p / 100;
    });
  }
  return { gross, discount, roundOff, net: r2(net), amounts };
}

/** The body for POST /api/register: one SALE with the lines (a single line is saved as the entry's own item). */
export type RegisterBody = Record<string, unknown> & { amountInr: number; lines?: unknown[]; partyName: string | null; notes: string | null; paymentMode: string };

export function registerBody(
  lines: CounterLine[],
  pay: CounterPay,
  opts: { date: string; party?: string; notes?: string; adjust?: BillAdjust; split?: SplitParts }
): { err: string } | { body: RegisterBody } {
  const sum = billSum(lines, opts.adjust);
  const amountInr = sum.net;
  if (sum.amounts.some((x) => !(x > 0)) && amountInr > 0) return { err: "The discount is bigger than an item's amount. Lower the discount." };
  if (!(amountInr > 0)) return { err: "Add at least one item with a weight and a rate." };
  const party = (opts.party || "").trim();
  if (pay === "CREDIT" && !party) return { err: "Udhaar needs the customer's name." };
  let splits: { channel: string; amount: number }[] | null = null;
  if (pay === "SPLIT") {
    splits = (["CASH", "UPI", "CREDIT"] as const).map((c) => ({ channel: c, amount: r2(opts.split?.[c] || 0) })).filter((x) => x.amount > 0);
    const sum = r2(splits.reduce((a, x) => a + x.amount, 0));
    if (Math.abs(sum - amountInr) > 0.01) return { err: `Split adds up to ₹${sum}, the bill is ₹${amountInr}.` };
    if (splits.some((x) => x.channel === "CREDIT") && !party) return { err: "Udhaar needs the customer's name." };
    if (splits.length < 2) splits = null;
  }
  const single = pay === "SPLIT" ? (["CASH", "UPI", "CREDIT"] as const).find((c) => (opts.split?.[c] || 0) > 0) || "CASH" : pay;
  const one = lines.length === 1 ? lines[0] : null;
  const audit = lines
    .map((l, i) => (l.source === "typed" ? `#${i + 1} typed` : l.source === "moving" ? `#${i + 1} read while moving` : ""))
    .filter(Boolean)
    .join(", ");
  return {
    body: {
      date: opts.date,
      kind: "SALE",
      amountInr,
      ...(splits ? { paymentMode: "CASH", splits } : { paymentMode: single, payChannel: single }),
      totalSale: false,
      counterBill: true,
      ...(one
        ? { item: one.item, itemLabel: one.item === "other" ? one.label : null, qty: one.qty, unit: one.unit, rateInr: one.rate }
        : { item: null, itemLabel: null, qty: null, unit: null, rateInr: null }),
      lines: lines.length > 1 ? lines.map((l, i) => ({ item: l.item, itemLabel: l.item === "other" ? l.label : null, qty: l.qty, unit: l.unit, rate: l.rate, amount: sum.amounts[i] })) : undefined,
      partyName: party || null,
      notes:
        [
          opts.notes?.trim(),
          lines.some((l) => lineDisc(l) > 0) ? `Item discount ₹${r2(lines.reduce((a, l) => a + lineDisc(l), 0))}` : "",
          sum.discount > 0 ? `Discount ₹${sum.discount}` : "",
          sum.roundOff ? `Round-off ${sum.roundOff > 0 ? "+" : "−"}₹${Math.abs(sum.roundOff)}` : "",
          audit ? `Counter: ${audit}` : "",
        ]
          .filter(Boolean)
          .join(" · ") || null,
    },
  };
}
