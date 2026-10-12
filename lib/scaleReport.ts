// Weighing-scale "PLU - Daily Report" (the printed sales report from the shop's
// scale). The scanner reads a photo of it; this file turns what the AI read
// into clean numbers and maps each product to the stock-tally product keys.
// Nothing here saves anything — the person checks the numbers first.

export interface ScaleLine {
  name: string;
  /** stock-tally product key (lib/calculations STOCK_PRODUCTS), or null for cans etc. */
  key: string | null;
  kg: number;
  pcs: number;
  amountInr: number;
}
export interface ScaleReport {
  reportDate: string | null; // YYYY-MM-DD when the printout shows one
  totalKg: number | null;
  totalInr: number | null;
  taxInr: number | null;
  lines: ScaleLine[];
}

/** Product name on the printout -> stock tally key. Order matters (first match wins). */
const PRODUCT_RULES: [RegExp, string][] = [
  [/gold\s*-?\s*drop|golddrop/i, "golddrop"],
  [/karadi|kardi|safflower|kusum/i, "karadi1"],
  [/sun\s*-?\s*flower|\bsf\b/i, "sf"],
  [/ground\s*-?\s*nut|shenga|peanut/i, "groundnut"],
  [/soya|soy\s*bean/i, "soyabean"],
  [/coconut|kobbari|khobra/i, "coconut"],
  [/tea\b|chai|chaha/i, "teapowder"],
  [/\btil\b|sesame|gingelly|ellu/i, "til"],
  [/mustard|sasive|sarso/i, "mustard"],
  [/\bk\s*-?\s*2\b/i, "k2"],
];

export function productKey(name: string): string | null {
  const n = String(name || "");
  if (/\bcan\b|tin\b|bottle|pouch|packet/i.test(n)) return null; // counted in pieces
  for (const [re, key] of PRODUCT_RULES) if (re.test(n)) return key;
  return null;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[₹,\s]|Rs\.?/gi, ""));
  return Number.isFinite(n) ? n : null;
};
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Accepts DD/MM/YY, DD-MM-YYYY or YYYY-MM-DD. */
export function parseReportDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})/.exec(s);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const mo = Number(m[2]);
  const d = Number(m[1]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function buildScaleReportPrompt(): string {
  return [
    `You read a photo of the printed "PLU - Daily Report" from a shop weighing scale (edible-oil shop, Karnataka, India).`,
    `Return ONLY one JSON object, no markdown, with exactly these keys:`,
    `{`,
    `  "reportDate": string or null     // date printed on the report, as written, e.g. "12/10/26"`,
    `  "totalWeightKg": number or null  // the "Weight" total in kg`,
    `  "totalPriceInr": number or null  // the "Total Price" in rupees`,
    `  "taxInr": number or null         // the "Tax" amount`,
    `  "products": [ { "name": string, "weightKg": number or null, "pieces": number or null, "amountInr": number or null } ]`,
    `  "confidence": "high" | "medium" | "low"`,
    `}`,
    `One entry in "products" per product line, with its own weight and money. Items counted in pieces (cans) use "pieces" and leave weightKg null.`,
    `Rules: use null for anything you cannot read clearly — never guess a number. Plain numbers, no commas or currency symbols. Do not include the grand-total row as a product.`,
  ].join("\n");
}

/** Turn the AI's answer into a ScaleReport (bad / missing values become empty, never invented). */
export function normalizeScaleReport(raw: unknown): ScaleReport {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(r.products) ? r.products : [];
  const lines: ScaleLine[] = [];
  for (const it of list) {
    const o = it as Record<string, unknown>;
    const name = String(o?.name ?? "").trim().slice(0, 40);
    if (!name) continue;
    const kg = Math.max(0, num(o.weightKg) ?? 0);
    const pcs = Math.max(0, num(o.pieces) ?? 0);
    const amt = Math.max(0, num(o.amountInr) ?? 0);
    if (!kg && !pcs && !amt) continue;
    lines.push({ name, key: productKey(name), kg: r3(kg), pcs: Math.round(pcs), amountInr: r2(amt) });
  }
  const tk = num(r.totalWeightKg);
  const tp = num(r.totalPriceInr);
  const tx = num(r.taxInr);
  return {
    reportDate: parseReportDate(r.reportDate),
    totalKg: tk !== null && tk >= 0 ? r3(tk) : null,
    totalInr: tp !== null && tp >= 0 ? r2(tp) : null,
    taxInr: tx !== null && tx >= 0 ? r2(tx) : null,
    lines,
  };
}

/** Two photos of the same long report: keep every product once, totals from whichever photo has them. */
export function mergeScaleReports(parts: ScaleReport[]): ScaleReport {
  const out: ScaleReport = { reportDate: null, totalKg: null, totalInr: null, taxInr: null, lines: [] };
  const seen = new Set<string>();
  for (const p of parts) {
    out.reportDate = out.reportDate || p.reportDate;
    out.totalKg = out.totalKg ?? p.totalKg;
    out.totalInr = out.totalInr ?? p.totalInr;
    out.taxInr = out.taxInr ?? p.taxInr;
    for (const l of p.lines) {
      const id = l.name.toLowerCase().replace(/\s+/g, "");
      if (seen.has(id)) continue;
      seen.add(id);
      out.lines.push(l);
    }
  }
  return out;
}

/** Warnings to show next to the numbers (the product lines should add up to the printed totals). */
export function scaleWarnings(r: ScaleReport): string[] {
  const w: string[] = [];
  const kg = r3(r.lines.reduce((a, l) => a + l.kg, 0));
  const money = r2(r.lines.reduce((a, l) => a + l.amountInr, 0));
  if (r.totalKg !== null && r.lines.length && Math.abs(kg - r.totalKg) > 0.5) w.push(`Product lines add up to ${kg} kg but the report total says ${r.totalKg} kg. A line may be missing: take the photo again or check.`);
  if (r.totalInr !== null && r.lines.length && Math.abs(money - r.totalInr) > 5) w.push(`Product lines add up to ₹${money.toLocaleString("en-IN")} but the report total says ₹${r.totalInr.toLocaleString("en-IN")}. Check before using.`);
  if (!r.lines.length && r.totalInr === null) w.push("Nothing could be read. Take the photo again, straight and well lit.");
  return w;
}

/** Oil sold per stock tank by the scale today (Gold Drop shares the Sunflower tank). */
export function soldByStockKey(r: ScaleReport): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of r.lines) if (l.key && l.kg) out[l.key] = r3((out[l.key] || 0) + l.kg);
  return out;
}
