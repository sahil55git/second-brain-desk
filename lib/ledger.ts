// One register for every entry: Quick Register sales, udhaar, purchases,
// expenses, job-work advances and settlements, refunds, and manufacturing
// batches. Money rows come from the day book; batches are production rows
// with no money. Pure, so it is tested without a database.

import { dayBook, inSpan, type BizData, type DateSpan } from "@/lib/bizReports";

export interface LedgerRow {
  key: string;
  at: string;
  date: string;
  source: string;
  type: string;
  party: string;
  detail: string;
  mode: string;
  in: number;
  out: number;
}

export function unifiedLedger(d: BizData, s: DateSpan) {
  const money: LedgerRow[] = dayBook(d, s).rows.map((r, i) => ({
    key: `m${i}`,
    at: r.at,
    date: r.date,
    source: r.source,
    type: r.type,
    party: r.party,
    detail: r.detail,
    mode: r.mode,
    in: r.in,
    out: r.out,
  }));
  const production: LedgerRow[] = (d.mfg || [])
    .filter((m) => typeof m.date === "string")
    .map((m) => ({ m, day: m.date.slice(0, 10) }))
    .filter(({ day }) => inSpan(day, s))
    .map(({ m, day }) => ({
      key: `p-${m.id}`,
      // Batches have no timestamp in the DTO, so they sort by day, after money rows of that day.
      at: `${day}T23:59:59Z`,
      date: day,
      source: "Manufacturing",
      type: "BATCH",
      party: m.mill || "",
      detail: `Barrel ${m.barrel} · ${m.productItem}`,
      mode: "",
      in: 0,
      out: 0,
    }));
  const rows = [...money, ...production].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const sum = (k: "in" | "out") => Math.round(rows.reduce((a, r) => a + r[k], 0) * 100) / 100;
  return {
    rows,
    totalIn: sum("in"),
    totalOut: sum("out"),
    sources: Array.from(new Set(rows.map((r) => r.source))).sort(),
  };
}
