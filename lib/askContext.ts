// 💡 Compact business digest for "Ask your business" and the AI CFO: a year of the shop's numbers as
// short tables the AI can read in one go. Pure — tested in lib/__tests__/askContext.test.ts.
import { expenseReport, purchaseReport, salesReport, udhaarReport, registerItemName, type BizData } from "./bizReports";
import { profitLoss } from "./money";
import { runOut, yieldLots } from "./insights";

const k = (n: number) => Math.round(n).toLocaleString("en-IN");
const monthsBack = (today: string, n: number) => {
  const out: { ym: string; from: string; to: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1));
    const ym = dt.toISOString().slice(0, 7);
    const end = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    out.push({ ym, from: `${ym}-01`, to: end > today ? today : end });
  }
  return out;
};

export function businessDigest(d: BizData, today: string, months = 13): string {
  const ms = monthsBack(today, months);
  const lines: string[] = [`TODAY ${today}. Amounts in ₹. Business: Mahadev Traders, Bidar — edible oil crushing, job-work, retail & wholesale.`];
  lines.push("", "MONTHLY: month | sales | purchases | expenses | net");
  for (const m of ms) { const p = profitLoss(d, m); lines.push(`${m.ym} | ${k(p.sales)} | ${k(p.purchases)} | ${k(p.expenses)} | ${k(p.net)}`); }
  // product × month kg and ₹
  const prod: Record<string, Record<string, { kg: number; inr: number }>> = {};
  for (const e of d.register) {
    if (e.kind !== "SALE" && e.kind !== "FRESH_CRUSH") continue;
    const ym = e.date.slice(0, 7);
    if (ym < ms[0].ym) continue;
    const p = ((prod[registerItemName(e)] ||= {})[ym] ||= { kg: 0, inr: 0 });
    p.kg += e.qty || 0; p.inr += e.amountInr;
  }
  for (const x of d.sales) for (const l of x.lineItems || []) {
    const ym = x.date.slice(0, 7);
    if (ym < ms[0].ym) continue;
    const p = ((prod[l.name] ||= {})[ym] ||= { kg: 0, inr: 0 });
    p.kg += l.qty; p.inr += l.lineTotalInr;
  }
  lines.push("", "SALES BY PRODUCT (month: kg/₹)");
  for (const [name, by] of Object.entries(prod).sort((a, b) => Object.values(b[1]).reduce((s, v) => s + v.inr, 0) - Object.values(a[1]).reduce((s, v) => s + v.inr, 0)).slice(0, 12)) {
    lines.push(`${name}: ${ms.filter((m) => by[m.ym]).map((m) => `${m.ym.slice(2)} ${Math.round(by[m.ym].kg)}/${k(by[m.ym].inr)}`).join("; ")}`);
  }
  const year = { from: ms[0].from, to: today };
  const s = salesReport(d, year), b = purchaseReport(d, year), ex = expenseReport(d, year);
  lines.push("", "TOP CUSTOMERS (12 m, ₹): " + (s.byParty || []).slice(0, 15).map((p: { key: string; amount: number }) => `${p.key} ${k(p.amount)}`).join("; "));
  lines.push("TOP SUPPLIERS (12 m, ₹): " + (b.bySupplier || []).slice(0, 12).map((p: { key: string; amount: number }) => `${p.key} ${k(p.amount)}`).join("; "));
  lines.push("EXPENSES BY KIND (12 m, ₹): " + ex.byCategory.slice(0, 15).map((c) => `${c.key} ${k(c.amount)}`).join("; "));
  // festival months (sales in Oct/Nov vs average) are visible in the monthly table
  const ud = udhaarReport(d, today);
  lines.push("", `UDHAAR OUTSTANDING ₹${k(ud.outstanding)}. Biggest: ` + ud.rows.filter((r) => r.balance > 0).slice(0, 12).map((r) => `${r.name} ${k(r.balance)} (last ${r.last})`).join("; "));
  lines.push("STOCK NOW: " + runOut(d, today).map((r) => `${r.name} ${r.stockKg ?? "?"} kg${r.daysLeft != null ? ` (${r.daysLeft} d)` : ""}`).join("; "));
  const lots = yieldLots(d, ms[Math.max(0, ms.length - 4)].from);
  if (lots.length) lines.push("RECENT YIELD LOTS: " + lots.slice(-15).map((l) => `${l.date} ${l.product} ${l.suppliers.join("+")} ${l.oilPct}%`).join("; "));
  return lines.join("\n").slice(0, 24000);
}

export const ASK_SYSTEM = `You answer the owner's questions about his own business from the DATA given (a digest of Mahadev Traders' records). Answer in short plain words, with the exact ₹ and kg from the data, naming months, products and parties. If the data does not contain the answer, say what is missing — never guess or invent a number. If he writes in Hindi or Kannada, answer in that language. End with one practical suggestion when it helps.`;

export const CFO_SYSTEM = `You are the CFO of Mahadev Traders (edible oil, Bidar). From the month's numbers write a one-page report in plain English for the owner: 1) How the month went (sales, profit, margin vs last month and last year). 2) Cash: risk in the next 30 days. 3) Where money leaked (expenses over budget, low-rate sales, stock gaps, unpaid udhaar). 4) Three specific actions for next month with the expected ₹ effect. Use only the numbers given; short lines; no invented figures. It is guidance, not professional tax advice.`;

/** The month's pack for the AI CFO (this month vs last and same month last year). */
export function cfoPack(d: BizData, today: string, extra: string[] = []): string {
  const ym = today.slice(0, 7);
  const thisM = { from: `${ym}-01`, to: today };
  const lastEnd = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10);
  const lastM = { from: `${lastEnd.slice(0, 7)}-01`, to: lastEnd };
  const lyM = { from: `${Number(ym.slice(0, 4)) - 1}-${ym.slice(5)}-01`, to: `${Number(today.slice(0, 4)) - 1}${today.slice(4)}` };
  const f = (label: string, s: { from: string; to: string }) => { const p = profitLoss(d, s); return `${label} (${s.from}→${s.to}): sales ${k(p.sales)}, purchases ${k(p.purchases)}, expenses ${k(p.expenses)}, net ${k(p.net)}${p.marginPct != null ? ` (${p.marginPct}%)` : ""}; top expenses ${p.topExpenses.map((e) => `${e.name} ${k(e.amount)}`).join(", ")}`; };
  return [f("THIS MONTH", thisM), f("LAST MONTH", lastM), f("SAME MONTH LAST YEAR", lyM), ...extra, "", businessDigest(d, today, 4)].join("\n");
}
