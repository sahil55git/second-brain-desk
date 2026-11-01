// Bank / PhonePe / UPI statement ↔ Quick Register matching. Pure: the statement's rows (from a
// CSV or Excel file) and the register's UPI / bank entries in, matched pairs and the leftovers out.
// Page: Insights → 🏦 Bank match. Tested in lib/__tests__/bankMatch.test.ts.

export interface BankTxn {
  i: number;
  date: string; // YYYY-MM-DD
  amount: number; // + money in, − money out
  desc: string;
  ref: string;
}
export interface RegEntry {
  id: string;
  date: string;
  kind: string;
  amountInr: number;
  paymentMode: string;
  partyName: string | null;
  itemLabel?: string | null;
  item?: string | null;
  notes?: string | null;
}
export interface MatchResult {
  matched: { bank: BankTxn; entry: RegEntry; dayGap: number }[];
  bankOnly: BankTxn[];
  registerOnly: RegEntry[];
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

/** Dates as banks write them: 01/11/2026, 01-11-26, 2026-11-01, 01 Nov 2026, Nov 01, 2026, 1-Nov-26 (day first). */
export function parseDate(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  const s = String(raw ?? "").trim().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (m) return `${year(m[3])}-${pad(+m[2])}-${pad(+m[1])}`;
  m = /^(\d{1,2})[\s-]([a-z]{3,4})[a-z]*[\s-](\d{2,4})/i.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) return `${year(m[3])}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(+m[1])}`;
  m = /^([a-z]{3,4})[a-z]*\s(\d{1,2})\s(\d{4})/i.exec(s);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[1].toLowerCase()])}-${pad(+m[2])}`;
  return null;
}

const money = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").replace(/[₹,\s]|INR|Rs\.?/gi, "").replace(/\((.*)\)/, "-$1");
  if (!s || s === "-") return null;
  const n = Number(s.replace(/(Cr|Dr)$/i, ""));
  if (!Number.isFinite(n)) return null;
  return /Dr$/i.test(String(v)) ? -Math.abs(n) : n;
};

/** CSV text → rows (handles quotes). */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/**
 * Find the header row and read the transactions. Works with the usual columns:
 * Date · Narration / Description / Details / Particulars · Withdrawal / Debit · Deposit / Credit ·
 * or one Amount column with a Type (CR / DR, Credit / Debit) column · Ref / UTR / Transaction ID.
 */
export function readStatement(rows: unknown[][]): { txns: BankTxn[]; problem: string | null } {
  const low = (v: unknown) => String(v ?? "").trim().toLowerCase();
  let h = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const r = rows[i].map(low);
    if (r.some((c) => /date/.test(c)) && r.some((c) => /amount|debit|credit|withdraw|deposit|paid|received/.test(c))) { h = i; break; }
  }
  if (h < 0) return { txns: [], problem: "Could not find the column names (Date, Amount / Debit / Credit). Download the statement as CSV or Excel." };
  const head = rows[h].map(low);
  const col = (re: RegExp, not?: RegExp) => head.findIndex((c) => re.test(c) && !(not && not.test(c)));
  const cDate = col(/(^|\s)(txn |transaction |value )?date/, /value/) >= 0 ? col(/(^|\s)(txn |transaction |value )?date/, /value/) : col(/date/);
  const cDesc = col(/narration|description|details|particulars|remarks|transaction details|name/);
  const cDebit = col(/withdraw|debit|dr\b|paid out|money out/);
  const cCredit = col(/deposit|credit|cr\b|received|money in/);
  const cAmt = col(/amount/);
  const cType = col(/^type$|cr\/dr|dr\/cr|transaction type|debit\/credit/);
  const cRef = col(/ref|utr|transaction id|txn id|cheque/);
  const txns: BankTxn[] = [];
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i];
    const date = parseDate(r[cDate]);
    if (!date) continue;
    let amount: number | null = null;
    if (cDebit >= 0 || cCredit >= 0) {
      const dr = cDebit >= 0 ? money(r[cDebit]) : null;
      const cr = cCredit >= 0 && cCredit !== cDebit ? money(r[cCredit]) : null;
      if (cr) amount = Math.abs(cr);
      else if (dr) amount = -Math.abs(dr);
    }
    if (amount === null && cAmt >= 0) {
      const a = money(r[cAmt]);
      if (a !== null) {
        const t = cType >= 0 ? low(r[cType]) : "";
        amount = /^d|debit|paid|sent/.test(t) ? -Math.abs(a) : /^c|credit|received/.test(t) ? Math.abs(a) : a;
      }
    }
    if (!amount) continue;
    txns.push({ i, date, amount: Math.round(amount * 100) / 100, desc: cDesc >= 0 ? String(r[cDesc] ?? "").trim() : "", ref: cRef >= 0 ? String(r[cRef] ?? "").trim() : "" });
  }
  return { txns, problem: txns.length ? null : "No transactions found under the column names." };
}

const IN_KINDS = ["SALE", "FRESH_CRUSH", "UDHAAR_IN"];
/** + for money in, − for money out (register UPI / bank entries only). */
export function signedAmount(e: RegEntry): number | null {
  if (e.paymentMode !== "UPI" && e.paymentMode !== "BANK") return null;
  if (IN_KINDS.includes(e.kind)) return e.amountInr;
  if (e.kind === "PURCHASE" || e.kind === "EXPENSE" || e.kind === "PAYMENT") return -e.amountInr;
  return null; // pigmee / owner draw: not in the bank as such
}

const gap = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;

/** Same amount within `days` days; the nearest date wins, each side used once. */
export function matchStatement(txns: BankTxn[], entries: RegEntry[], days = 2): MatchResult {
  const regs = entries.map((e) => ({ e, s: signedAmount(e) })).filter((x): x is { e: RegEntry; s: number } => x.s !== null);
  const pairs: { b: number; r: number; g: number }[] = [];
  txns.forEach((t, bi) => regs.forEach((x, ri) => {
    if (Math.abs(x.s - t.amount) < 0.5) {
      const g = gap(t.date, x.e.date);
      if (g <= days) pairs.push({ b: bi, r: ri, g });
    }
  }));
  pairs.sort((a, b) => a.g - b.g);
  const usedB = new Set<number>(), usedR = new Set<number>();
  const matched: MatchResult["matched"] = [];
  for (const p of pairs) {
    if (usedB.has(p.b) || usedR.has(p.r)) continue;
    usedB.add(p.b); usedR.add(p.r);
    matched.push({ bank: txns[p.b], entry: regs[p.r].e, dayGap: p.g });
  }
  const span = txns.length ? { from: txns.reduce((a, t) => (t.date < a ? t.date : a), txns[0].date), to: txns.reduce((a, t) => (t.date > a ? t.date : a), txns[0].date) } : null;
  return {
    matched: matched.sort((a, b) => (a.bank.date < b.bank.date ? -1 : 1)),
    bankOnly: txns.filter((_, i) => !usedB.has(i)),
    // only register entries inside the statement's dates can be missing from it
    registerOnly: regs.filter((x, i) => !usedR.has(i) && span && x.e.date >= span.from && x.e.date <= span.to).map((x) => x.e),
  };
}
