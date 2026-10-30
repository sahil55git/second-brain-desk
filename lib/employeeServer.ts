// Server helpers for the employee ledger. Everything here is OWNER-ONLY: salaries are private.
import { NextResponse } from "next/server";
import { balanceOf, round2 } from "@/lib/employeeLedger";
import { businessDate } from "@/lib/register";

export const currentMonth = () => businessDate(Date.now()).slice(0, 7);

export function ownerGate(user: { isOwner: boolean } | null) {
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!user.isOwner) return NextResponse.json({ error: "The employee ledger is for the owner only." }, { status: 403 });
  return null;
}

type Line = { creditInr: number; debitInr: number; month: string; type: string; date: string };

/** Employee row plus its totals, from its live (not voided) entries. */
export function shapeEmployee(e: Record<string, any>, lines: Line[], month: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const inMonth = lines.filter((l) => l.month === month);
  const last = [...lines].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))[0] ?? null;
  return {
    id: e.id as string,
    name: e.name as string,
    role: e.role as string,
    phone: (e.phone ?? null) as string | null,
    monthlySalaryInr: e.monthlySalaryInr as number,
    joinDate: e.joinDate as string,
    active: e.active as boolean,
    notes: (e.notes ?? null) as string | null,
    balanceInr: balanceOf(lines),
    creditInr: round2(lines.reduce((a, l) => a + l.creditInr, 0)),
    debitInr: round2(lines.reduce((a, l) => a + l.debitInr, 0)),
    earnedThisMonthInr: round2(inMonth.filter((l) => l.type === "EARN" || l.type === "BONUS").reduce((a, l) => a + l.creditInr, 0)),
    earnPostedThisMonth: inMonth.some((l) => l.type === "EARN"),
    last: last ? { date: last.date, type: last.type, amountInr: last.creditInr || last.debitInr } : null,
  };
}

export const ENTRY_SELECT = { id: true, date: true, month: true, type: true, creditInr: true, debitInr: true, mode: true, note: true, editNote: true, enteredBy: true, createdAt: true } as const;
