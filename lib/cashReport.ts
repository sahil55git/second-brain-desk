// Cash tally report helpers: cash in / out summary, "entered vs missing" checklist,
// direct-total counting and plain labels for the entry log. Pure functions so they can be tested.
import { EXTRA_META, MEMO_LINES, MEMO_META, extrasDelta, isExtraLine, isMemoLine, notInApp, type AppLine, type ExtraTotals, type MemoLine, type MemoRow } from "./memoTotals";

export type CheckStatus = "ok" | "miss" | "none";
export interface CheckItem {
  key: string;
  label: string;
  status: CheckStatus;
  note: string;
}

const rs = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export interface ChecklistInput {
  app: Record<MemoLine, AppLine>;
  memo: MemoRow[];
  upi: Partial<Record<"UPI_GPAY" | "UPI_PHONEPE", { amountInr: number }>>;
  extras: ExtraTotals;
  /** UPI taken in the app's own entries (sales + udhaar) */
  appUpi: { gpay: number; phonepe: number };
  counted: number;
  scaleKept: boolean;
  handoverSaved: boolean;
}

export function buildChecklist(i: ChecklistInput): CheckItem[] {
  const out: CheckItem[] = [];
  for (const l of MEMO_LINES) {
    const m = MEMO_META[l];
    const a = i.app[l];
    const memo = i.memo.find((x) => x.line === l);
    const label = `${m.icon} ${m.en}`;
    if (!memo) {
      out.push({ key: l, label, status: a.amount > 0 ? "ok" : "none", note: a.amount > 0 ? `${rs(a.amount)} entered in the app` : "nothing today" });
      continue;
    }
    const gap = notInApp(memo.amountInr, a);
    out.push({ key: l, label, status: gap > 0 ? "miss" : "ok", note: gap > 0 ? `memo sheet ${rs(memo.amountInr)}: ${rs(gap)} not entered` : `all ${rs(memo.amountInr)} entered` });
  }
  for (const [k, label, inApp] of [["UPI_GPAY", "📱 Shop GPay", i.appUpi.gpay], ["UPI_PHONEPE", "🟣 Owner PhonePe", i.appUpi.phonepe]] as const) {
    const t = i.upi[k];
    if (!t) {
      out.push({ key: k, label, status: inApp > 0 ? "ok" : "none", note: inApp > 0 ? `${rs(inApp)} entered in the app` : "nothing today" });
      continue;
    }
    const gap = Math.max(0, Math.round((t.amountInr - inApp) * 100) / 100);
    out.push({ key: k, label, status: gap > 0 ? "miss" : "ok", note: gap > 0 ? `app total ${rs(t.amountInr)}: ${rs(gap)} not entered` : `all ${rs(t.amountInr)} entered` });
  }
  out.push({ key: "OPENING", label: `${EXTRA_META.OPENING.icon} ${EXTRA_META.OPENING.en}`, status: "ok", note: i.extras.opening === null ? "taken from the last closing" : `${rs(i.extras.opening)} typed` });
  out.push({ key: "OWNER_DRAW", label: `${EXTRA_META.OWNER_DRAW.icon} ${EXTRA_META.OWNER_DRAW.en}`, status: "none", note: i.extras.ownerDraw > 0 ? `${rs(i.extras.ownerDraw)} typed` : "nothing typed" });
  out.push({ key: "SCALE", label: "⚖️ Scale report", status: i.scaleKept ? "ok" : "miss", note: i.scaleKept ? "kept for the day" : "not scanned yet" });
  out.push({ key: "COUNT", label: "✍️ Cash counted", status: i.counted > 0 ? "ok" : "miss", note: i.counted > 0 ? `${rs(i.counted)} counted` : "count not done yet" });
  out.push({ key: "HANDOVER", label: "🤝 Handover", status: i.handoverSaved ? "ok" : "miss", note: i.handoverSaved ? "saved" : "who counted and who took over" });
  return out;
}

export interface SummaryRow {
  label: string;
  amount: number;
  /** "in" adds to counter cash, "out" takes away */
  dir: "in" | "out";
}
export interface CashSummary {
  inRows: SummaryRow[];
  outRows: SummaryRow[];
  totalIn: number;
  totalOut: number;
  expected: number;
}

/** How the counter cash is made: the app's buckets, plus the typed extras and memo-sheet change. */
export function cashSummary(b: Record<string, number>, extras: ExtraTotals, memoLines: { line: MemoLine; delta: number }[]): CashSummary {
  const opening = extras.opening === null ? b.cashInOpening : extras.opening;
  const inRows: SummaryRow[] = [
    { label: extras.opening === null ? "Opening cash" : "Opening cash (typed)", amount: opening, dir: "in" },
    { label: "Sales (cash)", amount: b.cashInSales, dir: "in" },
    { label: "Udhaar received (cash)", amount: b.cashInOther, dir: "in" },
    { label: "Cash in (other, typed)", amount: extras.otherIn, dir: "in" },
  ];
  const outRows: SummaryRow[] = [
    { label: "Job-work payouts", amount: b.cashOutGrn, dir: "out" },
    { label: "Expenses / purchases", amount: b.cashOutExpenses + b.cashOutOther, dir: "out" },
    { label: "Salary", amount: b.cashOutSalary, dir: "out" },
    { label: "UPI out", amount: b.cashOutUpi, dir: "out" },
    { label: "Owner draw / pigmee", amount: b.cashOutDraw, dir: "out" },
    { label: "Owner withdraw (typed)", amount: extras.ownerDraw, dir: "out" },
  ];
  // Each saved memo line replaces the app's cash for that line. Show its change on the side it belongs to.
  for (const m of memoLines) {
    if (Math.abs(m.delta) < 0.01) continue;
    const label = `${MEMO_META[m.line].en} (memo sheet)`;
    if (m.delta > 0) inRows.push({ label, amount: m.delta, dir: "in" });
    else outRows.push({ label, amount: -m.delta, dir: "out" });
  }
  const sum = (r: SummaryRow[]) => Math.round(r.reduce((a, x) => a + x.amount, 0) * 100) / 100;
  const totalIn = sum(inRows);
  const totalOut = sum(outRows);
  return { inRows, outRows, totalIn, totalOut, expected: Math.round((totalIn - totalOut) * 100) / 100 };
}

/** A typed "total cash counted" replaces the note-by-note addition. */
export function countedTotal(direct: string | number | null | undefined, notesTotal: number): { counted: number; usingDirect: boolean } {
  const d = typeof direct === "number" ? direct : parseFloat(String(direct ?? "").replace(/,/g, ""));
  if (Number.isFinite(d) && d > 0) return { counted: Math.round(d * 100) / 100, usingDirect: true };
  return { counted: notesTotal, usingDirect: false };
}

export interface LogRow {
  id: string;
  line: string;
  action: string;
  amountInr: number | null;
  prevInr: number | null;
  session?: string | null;
  enteredByName?: string | null;
  createdAt: string;
}

export function logWhat(r: Pick<LogRow, "line" | "action" | "session">): string {
  const s = r.session === "AFTERNOON" ? " (Tally 1)" : r.session === "NIGHT" ? " (Tally 2)" : "";
  let name: string;
  if (isMemoLine(r.line)) name = `${MEMO_META[r.line].en} memo total`;
  else if (isExtraLine(r.line)) name = EXTRA_META[r.line].en;
  else if (r.line === "UPI_GPAY") name = "UPI Shop GPay total";
  else if (r.line === "UPI_PHONEPE") name = "UPI Owner PhonePe total";
  else if (r.line === "SCALE") name = "Scale report";
  else if (r.line === "COUNT") name = "Cash counted";
  else if (r.line === "HANDOVER") name = "Handover";
  else name = r.line;
  return `${r.action === "DELETE" ? "Removed " : ""}${name}${s}`;
}

export function logAmount(r: Pick<LogRow, "amountInr" | "prevInr" | "action">): string {
  if (r.action === "DELETE") return r.prevInr == null ? "removed" : `was ${rs(r.prevInr)}`;
  if (r.amountInr == null) return "—";
  return r.prevInr != null && r.prevInr !== r.amountInr ? `${rs(r.prevInr)} → ${rs(r.amountInr)}` : rs(r.amountInr);
}

/** Opening cash typed in the tally vs the computed one, shown only for context. */
export const extrasChange = extrasDelta;
