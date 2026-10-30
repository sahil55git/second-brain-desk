// Daily wages for one day, for many people at once (hamali, loading, seasonal crushing help).
// GET ?date= lists the active daily-wage people and what is already entered for that day.
// POST writes one "daily wages" line per person who worked (days × daily wage) and, when the wage
// was paid the same evening, one "salary paid" line for the same amount. A person already entered
// for that day is skipped, so pressing Save twice never doubles a day. Owner-only.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { balanceOf, daysText, isDate, validateWages } from "@/lib/employeeLedger";
import { ownerGate, rupeesText } from "@/lib/employeeServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  const blocked = ownerGate(user);
  if (blocked) return blocked;
  const d = req.nextUrl.searchParams.get("date");
  const date = isDate(d) ? d : businessDate(Date.now());
  const r = await safeDbCall(() =>
    prisma.employee.findMany({
      where: { active: true },
      orderBy: [{ payType: "asc" }, { name: "asc" }],
      include: { entries: { where: { voidedAt: null }, select: { id: true, type: true, date: true, days: true, creditInr: true, debitInr: true, month: true } } },
    })
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({
    date,
    data: r.data.map((e) => {
      const today = e.entries.filter((l) => l.date === date && l.type === "WAGE");
      return {
        id: e.id,
        name: e.name,
        role: e.role,
        payType: e.payType === "DAILY" ? "DAILY" : "MONTHLY",
        dailyWageInr: e.dailyWageInr ?? null,
        balanceInr: balanceOf(e.entries),
        entered: today.length ? { days: today.reduce((a, l) => a + (l.days || 0), 0), amountInr: today.reduce((a, l) => a + l.creditInr, 0) } : null,
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  const blocked = ownerGate(user);
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  const v = validateWages(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const by = user!.name || "owner";
  const { date } = v;
  const month = date.slice(0, 7);
  const r = await safeDbCall(async () => {
    const done: { employeeId: string; name: string; amountInr: number; paidInr: number }[] = [];
    const skipped: { employeeId: string; name?: string; reason: string }[] = [];
    for (const row of v.rows) {
      const res: { name?: string; skip?: string } = await prisma.$transaction(async (tx) => {
        const e = await tx.employee.findUnique({ where: { id: row.employeeId } });
        if (!e || !e.active) return { skip: "not found or not active" };
        const again = await tx.employeeEntry.findFirst({ where: { employeeId: e.id, date, type: "WAGE", voidedAt: null } });
        if (again) return { skip: "already entered for this day", name: e.name };
        const note = `${daysText(row.days)} × ${rupeesText(row.rateInr)}${row.note ? ` · ${row.note}` : ""}`;
        const w = await tx.employeeEntry.create({ data: { employeeId: e.id, date, month, type: "WAGE", days: row.days, creditInr: row.amountInr, debitInr: 0, note, enteredBy: by } });
        if (row.paidNow) await tx.employeeEntry.create({ data: { employeeId: e.id, date, month, type: "PAY", creditInr: 0, debitInr: row.amountInr, mode: row.mode, note: `Wages paid for ${daysText(row.days)}`, enteredBy: by } });
        await tx.employeeEvent.create({ data: { employeeId: e.id, entryId: w.id, action: "WAGES", by, detail: { date, days: row.days, rateInr: row.rateInr, amountInr: row.amountInr, paidNow: row.paidNow, mode: row.paidNow ? row.mode : null } } });
        return { name: e.name };
      });
      if (res.skip) skipped.push({ employeeId: row.employeeId, name: res.name, reason: res.skip });
      else done.push({ employeeId: row.employeeId, name: res.name ?? "", amountInr: row.amountInr, paidInr: row.paidNow ? row.amountInr : 0 });
    }
    return { done, skipped };
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json(r.data);
}
