// Cash tally report helpers: cash in / out summary, "entered vs missing" checklist,
// direct-total counting and plain labels for the entry log. Pure functions so they can be tested.
import { isMemoLine, MEMO_META } from "./memoTotals";
import { SHEET_META, isSheetLine, type Sheet } from "./cashSheet";

export type CheckStatus = "ok" | "miss" | "none";
export interface CheckItem {
  key: string;
  label: string;
  status: CheckStatus;
  note: string;
}

const rs = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export interface ChecklistInput {
  sheet: Sheet;
  /** UPI the app's own entries took */
  appUpi: { gpay: number; phonepe: number };
  counted: number;
  scaleKept: boolean;
  handoverSaved: boolean;
}

/** Entered vs missing, line by line, from the same sheet the tally uses. */
export function buildChecklist(i: ChecklistInput): CheckItem[] {
  const out: CheckItem[] = [];
  for (const r of i.sheet.rows) {
    const m = SHEET_META[r.line];
    const label = `${m.icon} ${m.en}`;
    if (r.line === "OPENING") {
      out.push({ key: r.line, label, status: "ok", note: r.memo === null ? `${rs(r.used)} from the last closing` : `${rs(r.memo)} typed` });
      continue;
    }
    if (r.memo === null) {
      out.push({ key: r.line, label, status: r.app > 0 ? "ok" : "none", note: r.app > 0 ? `${rs(r.app)} in the app` : "nothing today" });
      continue;
    }
    const miss = r.missing ?? 0;
    out.push({ key: r.line, label, status: miss > 0 ? "miss" : "ok", note: miss > 0 ? `memo sheet ${rs(r.memo)} · ${rs(miss)} not entered in the app` : `memo sheet ${rs(r.memo)} · all in the app` });
  }
  for (const [k, label, typed, inApp, val] of [
    ["UPI_GPAY", "📱 Shop GPay", i.sheet.upi.gpayTyped, i.appUpi.gpay, i.sheet.upi.gpay],
    ["UPI_PHONEPE", "🟣 Owner PhonePe", i.sheet.upi.phonepeTyped, i.appUpi.phonepe, i.sheet.upi.phonepe],
  ] as const) {
    if (!typed) {
      out.push({ key: k, label, status: inApp > 0 ? "ok" : "none", note: inApp > 0 ? `${rs(inApp)} in the app` : "nothing today" });
      continue;
    }
    const gap = Math.max(0, Math.round((val - inApp) * 100) / 100);
    out.push({ key: k, label, status: gap > 0 ? "miss" : "ok", note: gap > 0 ? `app total ${rs(val)} · ${rs(gap)} not entered` : `app total ${rs(val)} · all entered` });
  }
  out.push({ key: "SCALE", label: "⚖️ Scale report", status: i.scaleKept ? "ok" : "miss", note: i.scaleKept ? "kept for the day" : "not scanned yet" });
  out.push({ key: "COUNT", label: "✍️ Cash counted", status: i.counted > 0 ? "ok" : "miss", note: i.counted > 0 ? `${rs(i.counted)} counted` : "count not done yet" });
  out.push({ key: "HANDOVER", label: "🤝 Handover", status: i.handoverSaved ? "ok" : "miss", note: i.handoverSaved ? "saved" : "who counted and who took over" });
  return out;
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
  if (isSheetLine(r.line)) name = SHEET_META[r.line].en;
  else if (isMemoLine(r.line)) name = MEMO_META[r.line].en;
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
