// ⚡ Rules — "if this then that" for the shop. The owner writes simple rules (Rules page); every
// morning and evening they are checked and, when true, send a chat alert and/or make a task.
// Pure — tested in lib/__tests__/rules.test.ts.
import { udhaarReport, expenseReport, type BizData } from "./bizReports";
import { runOut } from "./insights";
import type { MandiSignal } from "./mandi";

export type RuleWhen =
  | { t: "udhaar"; minInr: number; minDays: number } // any customer owes ≥ ₹ for ≥ days
  | { t: "stockDays"; product: string; maxDays: number } // product runs out within N days ("any" = every product)
  | { t: "cashShort"; minInr: number } // last count short by ≥ ₹
  | { t: "expenseMonth"; category: string; maxInr: number } // month's spend on a category > ₹
  | { t: "mandiBelow"; commodity: string; perKg: number } // mandi modal ≤ ₹/kg
  | { t: "saleBelow"; item: string; rate: number } // a sale today below ₹ rate
  | { t: "noEntry"; hours: number }; // no register entry for N hours (in shop hours)
export interface Rule { id: string; name: string; on: boolean; when: RuleWhen; then: { alert: boolean; task: boolean; text?: string } }
export interface Fired { ruleId: string; name: string; key: string; text: string }

const norm = (s: string | null | undefined) => String(s || "").trim().toLowerCase();
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export const RULE_TEMPLATES: { label: string; when: RuleWhen }[] = [
  { label: "Udhaar over ₹20,000 for 30+ days", when: { t: "udhaar", minInr: 20000, minDays: 30 } },
  { label: "Any oil runs out within 3 days", when: { t: "stockDays", product: "any", maxDays: 3 } },
  { label: "Cash short ₹500+ at count", when: { t: "cashShort", minInr: 500 } },
  { label: "Diesel this month over ₹10,000", when: { t: "expenseMonth", category: "Diesel", maxInr: 10000 } },
  { label: "Groundnut mandi below ₹60/kg", when: { t: "mandiBelow", commodity: "Groundnut", perKg: 60 } },
  { label: "Groundnut oil sold below ₹180", when: { t: "saleBelow", item: "groundnut", rate: 180 } },
  { label: "No entry for 3 hours", when: { t: "noEntry", hours: 3 } },
];

export function describeWhen(w: RuleWhen): string {
  switch (w.t) {
    case "udhaar": return `a customer owes ₹${w.minInr.toLocaleString("en-IN")}+ for ${w.minDays}+ days`;
    case "stockDays": return `${w.product === "any" ? "any oil" : w.product} runs out within ${w.maxDays} days`;
    case "cashShort": return `cash count is ₹${w.minInr}+ short`;
    case "expenseMonth": return `${w.category} this month is over ₹${w.maxInr.toLocaleString("en-IN")}`;
    case "mandiBelow": return `${w.commodity} mandi price is ₹${w.perKg}/kg or less`;
    case "saleBelow": return `${w.item} sold below ₹${w.rate}`;
    case "noEntry": return `no entry for ${w.hours} hours`;
  }
}

export function evaluateRules(rules: Rule[], d: BizData, today: string, o: { mandi?: MandiSignal[]; nowMs?: number; hourIst?: number } = {}): Fired[] {
  const out: Fired[] = [];
  for (const r of rules) {
    if (!r.on) continue;
    const w = r.when;
    const fire = (key: string, text: string) => out.push({ ruleId: r.id, name: r.name, key: `${r.id}:${key}`, text: r.then.text ? `${r.then.text} — ${text}` : text });
    if (w.t === "udhaar") {
      for (const p of udhaarReport(d, today).rows) if (p.balance >= w.minInr && days(p.last, today) >= w.minDays) fire(norm(p.name), `${p.name} owes ₹${Math.round(p.balance).toLocaleString("en-IN")} (last activity ${days(p.last, today)} days ago)`);
    } else if (w.t === "stockDays") {
      for (const s of runOut(d, today)) if ((w.product === "any" || norm(s.name).includes(norm(w.product))) && s.daysLeft != null && s.daysLeft <= w.maxDays) fire(s.key, `${s.name}: ${s.daysLeft <= 0 ? "out of stock" : `only ${s.daysLeft} days left`}`);
    } else if (w.t === "cashShort") {
      for (const c of d.closings) if (c.date === today && typeof c.cashDiffInr === "number" && c.cashDiffInr >= w.minInr) fire(`${c.date}-${c.session}`, `cash ₹${Math.round(c.cashDiffInr)} short at ${c.session === "AFTERNOON" ? "Tally 1" : "Tally 2"}`);
    } else if (w.t === "expenseMonth") {
      const ex = expenseReport(d, { from: `${today.slice(0, 8)}01`, to: today });
      const c = ex.byCategory.find((x) => norm(x.key).includes(norm(w.category)));
      if (c && c.amount > w.maxInr) fire(today.slice(0, 7), `${c.key} this month ₹${Math.round(c.amount).toLocaleString("en-IN")} (limit ₹${w.maxInr.toLocaleString("en-IN")})`);
    } else if (w.t === "mandiBelow") {
      const m = (o.mandi || []).find((x) => norm(x.commodity).startsWith(norm(w.commodity)));
      if (m && m.latest / 100 <= w.perKg) fire(m.latestDate, `${m.commodity} mandi ₹${(m.latest / 100).toFixed(1)}/kg on ${m.latestDate.split("-").reverse().join("-")}`);
    } else if (w.t === "saleBelow") {
      for (const e of d.register) if (e.date === today && e.kind === "SALE" && e.rateInr && e.rateInr < w.rate && norm(`${e.item} ${e.itemLabel}`).includes(norm(w.item))) fire(e.id, `${e.itemLabel || e.item} sold at ₹${e.rateInr} to ${e.partyName || "walk-in"}`);
    } else if (w.t === "noEntry") {
      const h = o.hourIst ?? 12;
      if (h < 10 || h > 20) continue;
      const last = d.register.filter((e) => e.date === today).reduce<number>((a, e) => Math.max(a, Date.parse(e.createdAt)), 0);
      const now = o.nowMs ?? Date.now();
      if (!last || now - last >= w.hours * 3600000) fire(`${today}-${Math.floor(now / (w.hours * 3600000))}`, last ? `no register entry for ${Math.floor((now - last) / 3600000)} hours` : "no register entry yet today");
    }
  }
  return out;
}
/** Only what has not fired before (keys already sent are skipped). */
export const freshOnly = (fired: Fired[], sent: string[]) => fired.filter((f) => !sent.includes(f.key));
