// Insights (/insights): oil yield by seed lot and supplier, how long stock lasts and what to buy,
// profit per kg for each oil, and udhaar to collect. Pure: BizData in, tables out — the page is
// components/insights/InsightsDesk.tsx, tested in lib/__tests__/insights.test.ts.
import type { BizData, RegisterRow } from "@/lib/bizReports";
import { computeBarrelYield } from "@/lib/mfgCalculations";
import { normalizeFreshCrush } from "@/lib/register";

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const shift = (d: string, days: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

// ------------------------------------------------------------------ the oils the shop deals in
export interface ProductDef {
  key: string;
  name: string;
  /** words that name it in entries, notes, bills */
  words: string[];
  /** stock tally key (lib/calculations STOCK_PRODUCTS) */
  tally?: string[];
  /** made here from seed, bought ready, or blended */
  make: "crush" | "buy" | "blend";
}
export const PRODUCTS: ProductDef[] = [
  { key: "karadi", name: "Karadi (safflower)", words: ["karadi", "safflower", "kusube", "ಕರಡಿ", "k2"], tally: ["karadi1", "k2"], make: "crush" },
  { key: "groundnut", name: "Groundnut", words: ["groundnut", "shenga", "shengdana", "peanut", "ಶೇಂಗಾ"], tally: ["groundnut"], make: "crush" },
  { key: "sunflower", name: "Sunflower", words: ["sunflower", "surajmukhi", "ಸೂರ್ಯಕಾಂತಿ", "sf"], tally: ["sf"], make: "buy" },
  { key: "mustard", name: "Mustard", words: ["mustard", "sarson", "ಸಾಸಿವೆ"], tally: ["mustard"], make: "crush" },
  { key: "soyabean", name: "Soyabean", words: ["soyabean", "soybean", "soya"], tally: ["soyabean"], make: "buy" },
  { key: "ekatva", name: "Ekatva (blend)", words: ["ekatva", "ಏಕತ್ವ"], make: "blend" },
];

const textOf = (e: Pick<RegisterRow, "item" | "itemLabel" | "notes">) => `${e.item || ""} ${e.itemLabel || ""} ${e.notes || ""}`.toLowerCase();
export const productOf = (text: string): ProductDef | null => {
  const t = text.toLowerCase();
  return PRODUCTS.find((p) => p.words.some((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, "i").test(t))) || null;
};
const isSeed = (t: string) => /seed|beej|ಬೀಜ|kaali|kalu/.test(t) || !/oil|ennu|ಎಣ್ಣೆ|tin|can/.test(t);

// ------------------------------------------------------------------ 1. oil yield by lot and supplier
export interface YieldLot {
  id: string;
  date: string;
  kind: "barrel" | "fresh";
  product: string;
  label: string;
  suppliers: string[];
  seedKg: number;
  oilKg: number;
  oilPct: number;
}
export interface SupplierYield {
  supplier: string;
  lots: number;
  seedKg: number;
  oilKg: number;
  oilPct: number;
  last: string;
  /** difference from the average of all suppliers, in % points */
  vsAvg: number;
}

export function yieldLots(d: BizData, from: string): YieldLot[] {
  const out: YieldLot[] = [];
  for (const b of d.mfg) {
    const date = b.date.slice(0, 10);
    if (date < from) continue;
    const sup = (b.suppliers || []).map((x) => ({ name: x.name, seedKg: x.seedKg }));
    const y = computeBarrelYield({ suppliers: sup, step1Kg: b.step1Kg, step2Kg: b.step2Kg, step3Kg: b.step3Kg, step4Kg: b.step4Kg, refOilPct: b.refOilPct, moisturePct: b.moisturePct, systemOilKgOverride: b.systemOilKgOverride });
    if (!y.totalSeedKg || !y.actualOilKg) continue;
    out.push({ id: b.id, date, kind: "barrel", product: b.productItem, label: `Barrel ${b.barrel}`, suppliers: sup.map((s) => s.name.trim()).filter(Boolean), seedKg: r1(y.totalSeedKg), oilKg: r1(y.actualOilKg), oilPct: r2((y.actualOilKg / y.totalSeedKg) * 100) });
  }
  for (const e of d.register) {
    if (e.kind !== "FRESH_CRUSH" || e.date < from) continue;
    const fc = normalizeFreshCrush(e.details);
    if (!fc || !fc.seedKg || !fc.oilKg) continue;
    const p = productOf(textOf(e));
    out.push({ id: e.id, date: e.date, kind: "fresh", product: p?.name || e.itemLabel || e.item || "Fresh crush", label: "Fresh crush", suppliers: [], seedKg: r1(fc.seedKg), oilKg: r1(fc.oilKg), oilPct: r2((fc.oilKg / fc.seedKg) * 100) });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Oil % per supplier; a lot with two suppliers counts for each in proportion to its seed. */
export function supplierYield(d: BizData, from: string): SupplierYield[] {
  const by: Record<string, { lots: number; seedKg: number; oilKg: number; last: string }> = {};
  for (const b of d.mfg) {
    const date = b.date.slice(0, 10);
    if (date < from) continue;
    const sup = (b.suppliers || []).filter((x) => x.name?.trim() && x.seedKg > 0);
    if (!sup.length) continue;
    const y = computeBarrelYield({ suppliers: sup.map((x) => ({ name: x.name, seedKg: x.seedKg })), step1Kg: b.step1Kg, step2Kg: b.step2Kg, step3Kg: b.step3Kg, step4Kg: b.step4Kg, refOilPct: b.refOilPct, moisturePct: b.moisturePct, systemOilKgOverride: b.systemOilKgOverride });
    if (!y.totalSeedKg || !y.actualOilKg) continue;
    for (const s of sup) {
      const share = s.seedKg / y.totalSeedKg;
      const k = s.name.trim().replace(/\s+/g, " ");
      const key = Object.keys(by).find((x) => x.toLowerCase() === k.toLowerCase()) || k;
      const v = (by[key] ||= { lots: 0, seedKg: 0, oilKg: 0, last: date });
      v.lots += 1;
      v.seedKg += s.seedKg;
      v.oilKg += y.actualOilKg * share;
      if (date > v.last) v.last = date;
    }
  }
  const all = Object.values(by);
  const avg = all.reduce((a, v) => a + v.seedKg, 0) ? (all.reduce((a, v) => a + v.oilKg, 0) / all.reduce((a, v) => a + v.seedKg, 0)) * 100 : 0;
  return Object.entries(by)
    .map(([supplier, v]) => {
      const pct = (v.oilKg / v.seedKg) * 100;
      return { supplier, lots: v.lots, seedKg: r1(v.seedKg), oilKg: r1(v.oilKg), oilPct: r2(pct), last: v.last, vsAvg: r2(pct - avg) };
    })
    .sort((a, b) => b.oilPct - a.oilPct);
}

// ------------------------------------------------------------------ 2. how long stock lasts, what to buy
export interface LastBuy { date: string; party: string; rate: number | null; qty: number | null; unit: string | null; amount: number; seed: boolean }
export interface RunOut {
  key: string;
  name: string;
  stockKg: number | null;
  stockDate: string | null;
  perDay: number | null;
  daysLeft: number | null;
  lastBuy: LastBuy | null;
  level: "out" | "low" | "ok" | "unknown";
}

/** Latest purchase of a product: Quick Register purchases and purchase bills. */
export function lastPurchase(d: BizData, p: ProductDef): LastBuy | null {
  let best: LastBuy | null = null;
  for (const e of d.register) {
    if (e.kind !== "PURCHASE") continue;
    const t = textOf(e);
    if (productOf(t)?.key !== p.key) continue;
    if (!best || e.date > best.date) best = { date: e.date, party: e.partyName || "", rate: e.rateInr ?? (e.qty ? r2(e.amountInr / e.qty) : null), qty: e.qty, unit: e.unit, amount: e.amountInr, seed: isSeed(t) };
  }
  for (const b of d.purchases) {
    for (const l of b.lineItems || []) {
      const t = (l.name || "").toLowerCase();
      if (productOf(t)?.key !== p.key) continue;
      if (!best || b.date > best.date) best = { date: b.date, party: b.party?.name || "", rate: l.rateInr ?? null, qty: l.qty ?? null, unit: l.unit ?? null, amount: r2((l.qty || 0) * (l.rateInr || 0)) || b.totalInr, seed: isSeed(t) };
    }
  }
  return best;
}

/** Stock left from the latest stock count, use per day from the last 14 days of counts. */
export function runOut(d: BizData, today: string, lowDays = 7): RunOut[] {
  const counts = d.closings
    .filter((c) => c.stock && Object.keys(c.stock).length && c.date <= today)
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
  const since = shift(today, -14);
  return PRODUCTS.map((p) => {
    let stockKg: number | null = null;
    let stockDate: string | null = null;
    if (p.tally?.length) {
      for (const c of counts) {
        const cells = c.stock as Record<string, { today?: number | null }>;
        const vals = p.tally.map((k) => cells[k]?.today).filter((v): v is number => typeof v === "number");
        if (vals.length) {
          stockKg = r1(vals.reduce((a, v) => a + v, 0));
          stockDate = c.date;
          break;
        }
      }
    }
    // daily sale from the counts (one figure a day: the closing count, else the midday one)
    const perDayMap: Record<string, number> = {};
    if (p.tally?.length) {
      for (const c of counts) {
        if (c.date < since) continue;
        const cells = c.stock as Record<string, { sale?: number | null }>;
        const sale = p.tally.map((k) => cells[k]?.sale).filter((v): v is number => typeof v === "number" && v > 0).reduce((a, v) => a + v, 0);
        if (sale > 0 && !(c.date in perDayMap)) perDayMap[c.date] = sale;
      }
    }
    // when no counts: register sales in kg / litres of this oil
    let used = Object.values(perDayMap).reduce((a, v) => a + v, 0);
    let days = Object.keys(perDayMap).length;
    if (!days) {
      for (const e of d.register) {
        if ((e.kind !== "SALE" && e.kind !== "FRESH_CRUSH") || e.date < since || !e.qty) continue;
        if (productOf(textOf(e))?.key !== p.key) continue;
        used += e.qty;
      }
      days = used > 0 ? 14 : 0;
    }
    const perDay = days ? r1(used / days) : null;
    const daysLeft = stockKg !== null && perDay ? Math.floor(stockKg / perDay) : null;
    const level: RunOut["level"] = stockKg === null || perDay === null ? (stockKg !== null && stockKg <= 0 ? "out" : "unknown") : stockKg <= 0 ? "out" : (daysLeft ?? 99) <= lowDays ? "low" : "ok";
    return { key: p.key, name: p.name, stockKg, stockDate, perDay, daysLeft, lastBuy: lastPurchase(d, p), level };
  });
}

export function runOutLine(r: RunOut): string {
  const parts = [`${r.name}`];
  if (r.daysLeft !== null) parts.push(r.daysLeft <= 0 ? "is out" : `lasts about ${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"} at the current pace`);
  else if (r.stockKg !== null) parts.push(`${r.stockKg} kg left`);
  if (r.lastBuy) parts.push(`last bought${r.lastBuy.party ? ` from ${r.lastBuy.party}` : ""}${r.lastBuy.rate ? ` at ₹${r.lastBuy.rate}` : ""}`);
  return parts.join(" — ");
}

// ------------------------------------------------------------------ 3. profit per kg
export interface CostInputs {
  /** ₹ per kg of seed (crush) / of oil (buy); blank = last purchase */
  rate: number | null;
  /** oil % from seed (crush); blank = average of recent lots */
  oilPct: number | null;
  crushPerKg: number;
  packPerKg: number;
  /** ₹ per kg of cake sold (crush): lowers the oil's cost */
  cakeRate: number;
  /** selling price per kg; blank = average of recent sales */
  sell: number | null;
  /** Ekatva: the two oils and their share */
  blend?: { a: string; b: string; aPct: number };
}
export const DEFAULT_COSTS: Record<string, CostInputs> = {
  karadi: { rate: null, oilPct: null, crushPerKg: 8, packPerKg: 0, cakeRate: 22, sell: null },
  groundnut: { rate: null, oilPct: null, crushPerKg: 8, packPerKg: 0, cakeRate: 35, sell: null },
  sunflower: { rate: null, oilPct: null, crushPerKg: 0, packPerKg: 0, cakeRate: 0, sell: null },
  mustard: { rate: null, oilPct: null, crushPerKg: 8, packPerKg: 0, cakeRate: 25, sell: null },
  soyabean: { rate: null, oilPct: null, crushPerKg: 0, packPerKg: 0, cakeRate: 0, sell: null },
  ekatva: { rate: null, oilPct: null, crushPerKg: 0, packPerKg: 6, cakeRate: 0, sell: null, blend: { a: "sunflower", b: "ricebran", aPct: 50 } },
};
export const MARGIN_TARGET_PCT = 8;

export interface ProfitRow {
  key: string;
  name: string;
  make: ProductDef["make"];
  rate: number | null;
  rateFrom: "set" | "last buy" | "none";
  oilPct: number | null;
  costPerKg: number | null;
  sell: number | null;
  sellFrom: "set" | "sales" | "none";
  marginPerKg: number | null;
  marginPct: number | null;
  soldKg30: number;
  profit30: number | null;
  note: string;
}

/** Average price per kg / litre of a product sold in the last 30 days (counter entries with a rate). */
export function avgSellRate(d: BizData, p: ProductDef, today: string): { rate: number | null; qty: number } {
  const since = shift(today, -30);
  let amt = 0, qty = 0;
  for (const e of d.register) {
    if ((e.kind !== "SALE" && e.kind !== "FRESH_CRUSH") || e.date < since || !e.qty || e.qty <= 0) continue;
    if (productOf(textOf(e))?.key !== p.key) continue;
    const a = e.rateInr ? e.rateInr * e.qty : e.amountInr;
    amt += a;
    qty += e.qty;
  }
  return { rate: qty ? r2(amt / qty) : null, qty: r1(qty) };
}

export function profitRows(d: BizData, today: string, set: Record<string, Partial<CostInputs>>, oilRates: Record<string, number | null> = {}): ProfitRow[] {
  const lots = yieldLots(d, shift(today, -120));
  return PRODUCTS.map((p) => {
    const c: CostInputs = { ...DEFAULT_COSTS[p.key], ...(set[p.key] || {}) } as CostInputs;
    const lb = lastPurchase(d, p);
    let rate = c.rate;
    let rateFrom: ProfitRow["rateFrom"] = rate ? "set" : "none";
    if (!rate && lb?.rate && (p.make === "crush" ? lb.seed : !lb.seed)) {
      rate = lb.rate;
      rateFrom = "last buy";
    }
    const mine = lots.filter((l) => productOf(l.product)?.key === p.key);
    const avgPct = mine.length ? mine.reduce((a, l) => a + l.oilKg, 0) / mine.reduce((a, l) => a + l.seedKg, 0) * 100 : null;
    const oilPct = c.oilPct ?? (avgPct ? r2(avgPct) : p.key === "karadi" ? 22 : p.key === "groundnut" ? 38 : p.key === "mustard" ? 33 : null);
    let cost: number | null = null;
    let note = "";
    if (p.make === "crush") {
      if (rate && oilPct) {
        const seedPerOil = 100 / oilPct;
        const cakePerOil = Math.max(0, seedPerOil - 1 - 0.02 * seedPerOil); // what is not oil, less ~2% loss
        cost = rate * seedPerOil + c.crushPerKg + c.packPerKg - c.cakeRate * cakePerOil;
        note = `${r1(seedPerOil)} kg seed per kg oil · cake credit ₹${r1(c.cakeRate * cakePerOil)}`;
      } else note = rate ? "set the oil %" : "no seed purchase yet — set the seed rate";
    } else if (p.make === "buy") {
      if (rate) cost = rate + c.packPerKg;
      else note = "no oil purchase yet — set the rate";
    } else {
      const b = c.blend || { a: "sunflower", b: "ricebran", aPct: 50 };
      const ra = oilRates[b.a] ?? null;
      const rb = oilRates[b.b] ?? null;
      if (rate) cost = rate + c.packPerKg;
      else if (ra && rb) {
        cost = (ra * b.aPct + rb * (100 - b.aPct)) / 100 + c.packPerKg;
        rateFrom = "last buy";
        rate = r2((ra * b.aPct + rb * (100 - b.aPct)) / 100);
      } else note = "set the blend oil rates";
      if (!note) note = `${b.aPct}:${100 - b.aPct} ${b.a} + ${b.b}`;
    }
    const sales = avgSellRate(d, p, today);
    const sell = c.sell ?? sales.rate;
    const sellFrom: ProfitRow["sellFrom"] = c.sell ? "set" : sales.rate ? "sales" : "none";
    const marginPerKg = cost !== null && sell ? r2(sell - cost) : null;
    const marginPct = marginPerKg !== null && sell ? r1((marginPerKg / sell) * 100) : null;
    return {
      key: p.key, name: p.name, make: p.make, rate, rateFrom, oilPct: p.make === "crush" ? oilPct : null,
      costPerKg: cost === null ? null : r2(cost), sell, sellFrom, marginPerKg, marginPct,
      soldKg30: sales.qty, profit30: marginPerKg !== null ? Math.round(marginPerKg * sales.qty) : null, note,
    };
  });
}

/** Price that gives the target margin. */
export const priceFor = (cost: number, targetPct = MARGIN_TARGET_PCT) => Math.ceil(cost / (1 - targetPct / 100));

// ------------------------------------------------------------------ 5. udhaar reminders
export interface UdhaarNote { name: string; kind: "REMIND" | "PROMISE" | "PAID"; date: string; amount: number | null; note: string | null; at: string }
export interface ReminderRow {
  name: string;
  balance: number;
  days: number;
  last: string;
  phone: string | null;
  promise: { date: string; amount: number | null } | null;
  promiseLate: boolean;
  remindedOn: string | null;
  /** days since the last reminder (null: never) */
  sinceRemind: number | null;
}

export function reminderRows(rows: { name: string; balance: number; last: string }[], phones: Record<string, string>, notes: UdhaarNote[], today: string): ReminderRow[] {
  const key = (s: string) => s.trim().toLowerCase();
  const phoneBy: Record<string, string> = {};
  for (const [n, p] of Object.entries(phones)) phoneBy[key(n)] = p;
  return rows
    .filter((r) => r.balance >= 1)
    .map((r) => {
      const mine = notes.filter((n) => key(n.name) === key(r.name)).sort((a, b) => (a.at < b.at ? 1 : -1));
      const pr = mine.find((n) => n.kind === "PROMISE");
      const rem = mine.find((n) => n.kind === "REMIND");
      const promise = pr && pr.at.slice(0, 10) >= r.last ? { date: pr.date, amount: pr.amount } : null;
      return {
        name: r.name,
        balance: r2(r.balance),
        days: Math.max(0, daysBetween(r.last, today)),
        last: r.last,
        phone: phoneBy[key(r.name)] || null,
        promise,
        promiseLate: !!promise && promise.date < today,
        remindedOn: rem ? rem.at.slice(0, 10) : null,
        sinceRemind: rem ? daysBetween(rem.at.slice(0, 10), today) : null,
      };
    })
    .sort((a, b) => Number(b.promiseLate) - Number(a.promiseLate) || b.days * b.balance - a.days * a.balance);
}

/** Indian mobile → 91XXXXXXXXXX for wa.me, or null. */
export function waPhone(p: string | null | undefined): string | null {
  const d = (p || "").replace(/\D/g, "");
  if (d.length === 10 && /^[6-9]/.test(d)) return `91${d}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  return null;
}

export function upiLink(vpa: string, name: string, amount: number, note: string): string {
  const q = new URLSearchParams({ pa: vpa, pn: name, am: amount.toFixed(2), cu: "INR", tn: note.slice(0, 50) });
  return `upi://pay?${q.toString()}`;
}

export function reminderText(o: { name: string; balance: number; shop: string; vpa?: string | null; today: string }): string {
  const amt = `₹${Math.round(o.balance).toLocaleString("en-IN")}`;
  const lines = [
    `Namaskara ${o.name} ji 🙏`,
    `This is a gentle reminder from ${o.shop}: your balance is ${amt} (as on ${o.today.split("-").reverse().join("-")}).`,
    "Please pay when convenient — cash at the shop or UPI.",
  ];
  if (o.vpa) lines.push(`UPI: ${o.vpa}`, `Pay now: ${upiLink(o.vpa, o.shop, o.balance, `Udhaar ${o.name}`)}`);
  lines.push("Thank you.");
  return lines.join("\n");
}
