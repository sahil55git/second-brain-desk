// Employee ledger rules — pure functions, no database. The same numbers are used by the API
// (to write rows) and by the screen (to show them), so the two can never disagree.

export type EntryType = "EARN" | "WAGE" | "BONUS" | "ADV" | "PAY" | "CUT" | "OPEN";
export type PayType = "MONTHLY" | "DAILY";
export type Mode = "CASH" | "UPI" | "BANK";

export const ENTRY_TYPES: Record<Exclude<EntryType, "OPEN">, { label: string; side: "credit" | "debit"; moves: boolean; help: string }> = {
  EARN: { label: "Salary earned", side: "credit", moves: false, help: "Adds to what the shop owes the person. Month-end salary does this for you." },
  WAGE: { label: "Daily wages", side: "credit", moves: false, help: "Days worked × the daily wage. The Daily wages tab enters many people for a day in one go." },
  BONUS: { label: "Bonus / overtime", side: "credit", moves: false, help: "Extra earned money: bonus, overtime, festival gift." },
  ADV: { label: "Advance given", side: "debit", moves: true, help: "Money given before it is earned. It comes off the next salary by itself." },
  PAY: { label: "Salary paid", side: "debit", moves: true, help: "Money paid out against what is owed." },
  CUT: { label: "Deduction", side: "debit", moves: false, help: "Absent days, fine, damage. Reduces what is owed. No cash moves." },
};
export const TYPE_LABEL: Record<EntryType, string> = { ...Object.fromEntries(Object.entries(ENTRY_TYPES).map(([k, v]) => [k, v.label])), OPEN: "Opening balance" } as Record<EntryType, string>;

export const MAX_AMOUNT_INR = 10_000_000;
export const MONTH_DAYS = 30; // salary is monthly ÷ 30, whatever the calendar month

export const isMonth = (m: unknown): m is string => typeof m === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
export const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

export interface LedgerLine {
  creditInr: number;
  debitInr: number;
}

/** What the shop owes the person (positive) or the person owes the shop (negative). */
export function balanceOf(lines: LedgerLine[]): number {
  return round2(lines.reduce((a, l) => a + (l.creditInr || 0) - (l.debitInr || 0), 0));
}

/** Add a running balance to each line, starting from the opening balance. */
export function withRunning<T extends LedgerLine>(lines: T[], opening = 0): (T & { balanceInr: number })[] {
  let run = opening;
  return lines.map((l) => {
    run = round2(run + (l.creditInr || 0) - (l.debitInr || 0));
    return { ...l, balanceInr: run };
  });
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Salary earned for the days present: monthly × days ÷ 30, to the rupee. */
export function earnedForDays(monthlySalaryInr: number, daysPresent: number): number {
  const d = Math.max(0, Math.min(31, Math.floor(daysPresent)));
  return Math.round((monthlySalaryInr * d) / MONTH_DAYS);
}

/** Month-end: earned for the month plus whatever was carried (an advance is a negative carry). */
export function payrollNet(earned: number, carried: number): { net: number; advanceRecovered: number; carryForward: number } {
  const total = round2(earned + carried);
  if (total >= 0) return { net: total, advanceRecovered: carried < 0 ? -carried : 0, carryForward: 0 };
  // Earned less than the advance: nothing to pay, the rest stays as an advance for next month.
  return { net: 0, advanceRecovered: earned, carryForward: total };
}

export type EntryInput = { type?: unknown; amountInr?: unknown; mode?: unknown; note?: unknown; date?: unknown };
export type EntryOk = { ok: true; type: Exclude<EntryType, "OPEN">; amountInr: number; mode: Mode | null; note: string | null; date: string | null; creditInr: number; debitInr: number };

export function validateEntry(i: EntryInput): EntryOk | { ok: false; error: string } {
  const type = typeof i.type === "string" && i.type in ENTRY_TYPES ? (i.type as keyof typeof ENTRY_TYPES) : null;
  if (!type) return { ok: false, error: "Choose what kind of entry this is." };
  const amount = Number(i.amountInr);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Type the amount in rupees." };
  if (amount > MAX_AMOUNT_INR) return { ok: false, error: "That amount is too large. Check the zeros." };
  const def = ENTRY_TYPES[type];
  const mode: Mode | null = def.moves ? (i.mode === "UPI" || i.mode === "BANK" ? i.mode : "CASH") : null;
  const note = typeof i.note === "string" && i.note.trim() ? i.note.trim().slice(0, 200) : null;
  if (i.date != null && i.date !== "" && !isDate(i.date)) return { ok: false, error: "That date is not valid." };
  const a = round2(amount);
  return { ok: true, type, amountInr: a, mode, note, date: isDate(i.date) ? i.date : null, creditInr: def.side === "credit" ? a : 0, debitInr: def.side === "debit" ? a : 0 };
}

/** Editing or deleting an entry always needs a reason. */
export function validateReason(r: unknown): { ok: true; reason: string } | { ok: false; error: string } {
  const s = typeof r === "string" ? r.trim() : "";
  return s.length >= 3 ? { ok: true, reason: s.slice(0, 200) } : { ok: false, error: "Write a reason (at least 3 letters)." };
}

export function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}
/** Last `n` months ending at `current` ("YYYY-MM"), newest first. */
export function recentMonths(current: string, n = 12): string[] {
  const [y, mo] = current.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, mo - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export interface CsvRow { date: string; type: string; mode: string | null; note: string | null; creditInr: number; debitInr: number; balanceInr: number; enteredBy?: string | null }
/** Excel-friendly CSV of one person's ledger for a month. */
export function ledgerCsv(name: string, month: string, openingInr: number, rows: CsvRow[]): string {
  const q = (v: unknown) => {
    const t = v == null ? "" : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lines = [["Employee", "Month", "Date", "Entry", "Paid by", "Note", "Credit (earned)", "Debit (paid)", "Running balance", "Entered by"].map(q).join(",")];
  lines.push([name, month, "", "Opening balance", "", "", "", "", openingInr, ""].map(q).join(","));
  for (const r of rows) lines.push([name, month, r.date, TYPE_LABEL[r.type as EntryType] ?? r.type, r.mode ?? "", r.note ?? "", r.creditInr || "", r.debitInr || "", r.balanceInr, r.enteredBy ?? ""].map(q).join(","));
  return lines.join("\r\n");
}

// ---------------------------------------------------------------------------
// Daily wages: people paid per day worked (hamali, loading, seasonal crushing help)
// ---------------------------------------------------------------------------
export const MAX_DAILY_WAGE_INR = 50_000;
export const payTypeOf = (v: unknown): PayType => (v === "DAILY" ? "DAILY" : "MONTHLY");

/** Days worked on one line: 0.5 steps (half day), 0.5 to 31. Null when not a sensible number. */
export function cleanDays(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 31) return null;
  return Math.round(n * 2) / 2 || null;
}

/** "1 day × ₹600", "½ day × ₹600", "2½ days × ₹600" */
export function daysText(days: number): string {
  const whole = Math.floor(days);
  const half = days - whole >= 0.5;
  const n = whole === 0 ? "½" : `${whole}${half ? "½" : ""}`;
  return `${n} day${days > 1 ? "s" : ""}`;
}

export const wageAmount = (days: number, rateInr: number) => round2(days * rateInr);

export interface WageRowIn { employeeId?: unknown; days?: unknown; rateInr?: unknown; paidNow?: unknown; mode?: unknown; note?: unknown }
export interface WageRowOk { employeeId: string; days: number; rateInr: number; amountInr: number; paidNow: boolean; mode: Mode; note: string }

/** One day's wages for several people, checked. Rows with no days (absent) are left out. */
export function validateWages(body: { date?: unknown; rows?: unknown }): { ok: true; date: string; rows: WageRowOk[] } | { ok: false; error: string } {
  if (!isDate(body.date)) return { ok: false, error: "Choose the date." };
  const raw = Array.isArray(body.rows) ? (body.rows as WageRowIn[]) : [];
  const rows: WageRowOk[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const id = typeof r.employeeId === "string" ? r.employeeId : "";
    if (!id || seen.has(id)) continue;
    const days = r.days === 0 || r.days === "0" || r.days == null || r.days === "" ? null : cleanDays(r.days);
    if (days == null) {
      if (r.days === 0 || r.days === "0" || r.days == null || r.days === "") continue; // absent
      return { ok: false, error: "Days worked must be ½ to 31." };
    }
    const rate = Number(r.rateInr);
    if (!Number.isFinite(rate) || rate <= 0 || rate > MAX_DAILY_WAGE_INR) return { ok: false, error: "Type the daily wage in rupees for everyone who worked." };
    seen.add(id);
    const note = typeof r.note === "string" ? r.note.trim().slice(0, 120) : "";
    rows.push({ employeeId: id, days, rateInr: round2(rate), amountInr: wageAmount(days, rate), paidNow: r.paidNow === true, mode: r.mode === "UPI" || r.mode === "BANK" ? r.mode : "CASH", note });
  }
  if (!rows.length) return { ok: false, error: "Mark at least one person as worked." };
  return { ok: true, date: body.date, rows };
}

/** Month-end for a daily-wage person: what the wage days earned this month and what is still owed. */
export function dailyMonth(lines: { type: string; month: string; days?: number | null; creditInr: number }[], month: string): { days: number; earnedInr: number } {
  const w = lines.filter((l) => l.month === month && l.type === "WAGE");
  return { days: Math.round(w.reduce((a, l) => a + (l.days || 0), 0) * 2) / 2, earnedInr: round2(w.reduce((a, l) => a + l.creditInr, 0)) };
}
