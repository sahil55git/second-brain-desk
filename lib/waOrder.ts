// 🛒 WhatsApp orders from customers: "5 L mustard, 2 tin groundnut" → order lines priced from the
// rate cards. Pure — tested in lib/__tests__/waOrder.test.ts. The webhook is app/api/wa/route.ts.
import { needsEnglish, toEnglish } from "./lang";
import { rateFor, type RateCards } from "./money";

export interface OrderLine { item: string; qty: number; unit: string; rate: number | null; amount: number | null }

const UNIT: [RegExp, string][] = [
  [/^(kg|kgs|kilo|kilos)$/, "kg"], [/^(l|ltr|ltrs|litre|litres|liter|liters)$/, "ltr"], [/^(tin|tins|dabba|can|cans)$/, "tin"],
  [/^(pouch|pouches|packet|packets|pkt|pkts)$/, "pkt"], [/^(bottle|bottles|btl)$/, "btl"], [/^(qtl|quintal)$/, "qtl"],
];
const unitOf = (w: string) => UNIT.find(([re]) => re.test(w))?.[1] || null;

/** Items the shop sells: names from the rate cards (lower case). */
export function catalog(cards: RateCards | null | undefined): string[] {
  const s = new Set<string>();
  for (const l of cards?.lists || []) for (const k of Object.keys(l.rates)) s.add(k);
  return Array.from(s);
}
const ALIAS: Record<string, string> = { mustard: "mustard", sarson: "mustard", groundnut: "groundnut", shenga: "groundnut", peanut: "groundnut", sunflower: "sunflower", karadi: "karadi", safflower: "karadi", kusum: "karadi", ekatva: "ekatva", cake: "cake", khali: "cake" };

/** Best catalog name for what the customer wrote ("mustard" → "mustard oil"). */
export function matchItem(words: string, items: string[]): string | null {
  const w = words.trim().toLowerCase();
  if (!w) return null;
  const exact = items.find((i) => i === w);
  if (exact) return exact;
  const key = Object.keys(ALIAS).find((a) => w.includes(a));
  const root = key ? ALIAS[key] : w.split(" ")[0];
  return items.find((i) => i.includes(root)) || null;
}

/** "5 L mustard, 2 tin groundnut oil" → lines. Pieces with no quantity or no known item are returned in `unknown`. */
export function parseOrder(text: string, items: string[]): { lines: { item: string; qty: number; unit: string }[]; unknown: string[] } {
  const s = (needsEnglish(text) ? toEnglish(text) : text.toLowerCase()).replace(/[•*\-]/g, " ");
  const parts = s.split(/,|\n|\band\b|\baur\b|\+|;/).map((p) => p.trim()).filter(Boolean);
  const lines: { item: string; qty: number; unit: string }[] = [];
  const unknown: string[] = [];
  for (const p of parts) {
    const m = /(\d+(?:\.\d+)?)\s*([a-z]+)?\s*(.*)/.exec(p);
    if (!m) { unknown.push(p); continue; }
    const qty = Number(m[1]);
    let unit = m[2] ? unitOf(m[2]) : null;
    let rest = unit ? m[3] : `${m[2] || ""} ${m[3]}`;
    if (!unit) { const t = /\b(kg|ltr|litre|liter|l|tin|tins|pouch|packet|bottle)\b/.exec(rest); if (t) { unit = unitOf(t[1]); rest = rest.replace(t[0], " "); } }
    const item = matchItem(rest.replace(/\b(of|oil|tel|please|pls|chahiye|send|bhejo)\b/g, " ").replace(/\s+/g, " ").trim() || rest, items) || matchItem(rest, items);
    if (!item || !(qty > 0)) { unknown.push(p); continue; }
    lines.push({ item, qty, unit: unit || "kg" });
  }
  return { lines, unknown };
}

export function priceOrder(lines: { item: string; qty: number; unit: string }[], cards: RateCards | null | undefined, customer: string | null): { lines: OrderLine[]; total: number | null } {
  const out = lines.map((l) => {
    const r = rateFor(cards, customer, l.item);
    return { ...l, rate: r?.rate ?? null, amount: r ? Math.round(r.rate * l.qty * 100) / 100 : null };
  });
  const total = out.every((l) => l.amount != null) ? Math.round(out.reduce((a, l) => a + (l.amount || 0), 0) * 100) / 100 : null;
  return { lines: out, total };
}

const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
export function orderSummary(lines: OrderLine[], total: number | null): string {
  return [
    ...lines.map((l) => `• ${cap(l.item)} — ${l.qty} ${l.unit}${l.rate != null ? ` × ₹${l.rate} = ₹${l.amount}` : " (price on confirm)"}`),
    total != null ? `*Total ₹${total.toLocaleString("en-IN")}* (before GST if any)` : "Total will be told on confirming.",
  ].join("\n");
}
export const WA_HELP = (shop: string, items: string[]) => [
  `🙏 Namaste! This is ${shop}. To order, send the quantity and oil, e.g.`,
  `*5 L groundnut, 2 tin mustard*`,
  items.length ? `We have: ${items.slice(0, 12).map(cap).join(", ")}` : "",
  `Send *menu* for prices, *status* for your last order.`,
].filter(Boolean).join("\n");
export function menuText(cards: RateCards | null | undefined, customer: string | null): string {
  const items = catalog(cards);
  if (!items.length) return "Price list is being updated — please send your order and we will confirm the price.";
  return ["*Today's prices*", ...items.map((i) => { const r = rateFor(cards, customer, i); return `• ${cap(i)}: ${r ? `₹${r.rate}` : "ask"}`; })].join("\n");
}
