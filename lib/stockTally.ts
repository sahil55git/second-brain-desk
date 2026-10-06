// Quick stock tally — the Daily Closing desk's 10-product oil-stock count,
// made quick to enter from the Quick Register. The maths is NOT
// re-implemented: it calls getYesterdayStock() / computeProductTally() from
// lib/calculations.ts, and flags gaps with the same 0.5 kg rule.
import {
  STOCK_GAP_CHIP_THRESHOLD_KG,
  STOCK_PRODUCTS,
  computeProductTally,
  getYesterdayStock,
  type StockProductComputed,
  type StockProductEntry,
} from "./calculations";

export const STOCK_KN: Record<string, string> = {
  sf: "ಸೂರ್ಯಕಾಂತಿ",
  karadi1: "ಕರಡಿ (ಟ್ಯಾಂಕ್ 1)",
  k2: "ಕೆ2",
  groundnut: "ಶೇಂಗಾ ಎಣ್ಣೆ",
  golddrop: "ಗೋಲ್ಡ್ ಡ್ರಾಪ್",
  soyabean: "ಸೋಯಾಬೀನ್ ಎಣ್ಣೆ",
  coconut: "ತೆಂಗಿನ ಎಣ್ಣೆ",
  teapowder: "ಚಹಾ ಪುಡಿ",
  til: "ಎಳ್ಳೆಣ್ಣೆ",
  mustard: "ಸಾಸಿವೆ ಎಣ್ಣೆ",
};

export interface TallyInput {
  today?: number | null;
  reportSale?: number | null;
  yesterdayOverride?: number | null;
}

export interface PriorClosing {
  createdAt: string | Date;
  stock?: Record<string, StockProductEntry> | null;
}

/** Gap to flag: sale − report sale, or for K2 (no report) today − yesterday. */
export function tallyGap(c: StockProductComputed): number | null {
  return c.gap ?? c.diff ?? null;
}
export function isFlagged(c: StockProductComputed): boolean {
  const g = tallyGap(c);
  return g !== null && Math.abs(g) >= STOCK_GAP_CHIP_THRESHOLD_KG;
}

/** Computes every product exactly the way the Daily Closing desk does. */
export function buildTally(prior: PriorClosing[], input: Record<string, TallyInput>, at: string | Date) {
  const rows = STOCK_PRODUCTS.map((p) => {
    const i = input[p.key] || {};
    const num = (v: unknown) => (v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
    const y = getYesterdayStock(prior, p.key, at, num(i.yesterdayOverride));
    const c = computeProductTally(p, num(i.today), num(i.reportSale), y.value, y.source);
    return { key: p.key, label: p.label, kn: STOCK_KN[p.key] || p.label, hasReportSale: p.hasReportSale, computed: c, flagged: isFlagged(c) };
  });
  return {
    rows,
    counted: rows.filter((r) => r.computed.today !== null).length,
    flagged: rows.filter((r) => r.flagged).length,
  };
}

/** Parses an uploaded CSV / Excel sheet: product (key or name), today, report sale. */
export function parseTallyRows(table: unknown[][]): { input: Record<string, TallyInput>; matched: number; skipped: string[] } {
  const input: Record<string, TallyInput> = {};
  const skipped: string[] = [];
  let matched = 0;
  const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9\u0C80-\u0CFF]/g, "");
  const find = (name: unknown) => {
    const n = norm(name);
    if (!n) return null;
    return (
      STOCK_PRODUCTS.find((p) => norm(p.key) === n || norm(p.label) === n || norm(STOCK_KN[p.key]) === n) ||
      STOCK_PRODUCTS.find((p) => n.length >= 3 && (norm(p.label).startsWith(n) || n.startsWith(norm(p.label))))
    );
  };
  for (const row of table) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const p = find(row[0]);
    const today = Number(row[1]);
    if (!p) {
      if (String(row[0] ?? "").trim() && !/product|item|name/i.test(String(row[0]))) skipped.push(String(row[0]));
      continue;
    }
    if (!Number.isFinite(today)) continue;
    const rs = row.length > 2 && row[2] !== "" && row[2] !== null && Number.isFinite(Number(row[2])) ? Number(row[2]) : null;
    input[p.key] = { today, reportSale: rs };
    matched += 1;
  }
  return { input, matched, skipped };
}

export function csvToTable(text: string): string[][] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      const out: string[] = [];
      let cur = "";
      let q = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (q) {
          if (ch === '"' && l[i + 1] === '"') {
            cur += '"';
            i++;
          } else if (ch === '"') q = false;
          else cur += ch;
        } else if (ch === '"') q = true;
        else if (ch === "," || ch === ";" || ch === "\t") {
          out.push(cur);
          cur = "";
        } else cur += ch;
      }
      out.push(cur);
      return out.map((c) => c.trim());
    });
}

/**
 * Position of a count in time: its business date + session (midday 1 pm,
 * closing 9 pm, IST). Counts are ordered by this — not by when they were
 * typed in — so a closing count entered the next morning for yesterday still
 * sits in the right place and "yesterday's stock" is looked up correctly.
 */
export function sessionStamp(date: string, session: string): Date {
  return new Date(`${date}T${session === "NIGHT" ? "21:00" : "13:00"}:00+05:30`);
}
