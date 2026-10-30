// Month-end salary. GET previews every active employee for a month (earned from days present,
// advance carried, net payable); POST posts it: one "salary earned" line and, when something is
// payable, one "salary paid" line per person. Posting is once per person per month. Owner-only.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { balanceOf, dailyMonth, earnedForDays, isMonth, MONTH_DAYS, monthLabel, payrollNet, payTypeOf } from "@/lib/employeeLedger";
import { currentMonth, ownerGate } from "@/lib/employeeServer";

export const dynamic = "force-dynamic";

async function load(month: string) {
  const emps = await prisma.employee.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: { entries: { where: { voidedAt: null }, select: { creditInr: true, debitInr: true, month: true, type: true } } },
  });
  return emps.map((e) => {
    const posted = e.entries.some((l) => l.month === month && l.type === "EARN");
    // Carried = everything except this month's own salary line (an advance is negative).
    const carried = balanceOf(e.entries.filter((l) => !(l.month === month && l.type === "EARN")));
    const payType = payTypeOf(e.payType);
    const dm = dailyMonth(e.entries, month);
    // a daily-wage person earns day by day: month-end only pays what is still owed
    return { id: e.id, name: e.name, role: e.role, monthlySalaryInr: e.monthlySalaryInr, payType, dailyWageInr: e.dailyWageInr ?? null, wageDays: dm.days, wageEarnedInr: dm.earnedInr, balanceInr: balanceOf(e.entries), posted, carriedInr: carried };
  });
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  const blocked = ownerGate(user);
  if (blocked) return blocked;
  const m = req.nextUrl.searchParams.get("month");
  const month = isMonth(m) ? m : currentMonth();
  const r = await safeDbCall(() => load(month));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ month, label: monthLabel(month), monthDays: MONTH_DAYS, data: r.data });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  const blocked = ownerGate(user);
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  if (!isMonth(body.month)) return NextResponse.json({ error: "Choose the month." }, { status: 400 });
  const month: string = body.month;
  const rows: { employeeId: string; days: number; mode?: string }[] = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return NextResponse.json({ error: "Choose at least one person." }, { status: 400 });
  const by = user!.name || "owner";
  const today = businessDate(Date.now());
  const date = today.startsWith(month) ? today : `${month}-28`;

  const r = await safeDbCall(async () => {
    const info = new Map((await load(month)).map((x) => [x.id, x]));
    const done: { employeeId: string; name: string; earnedInr: number; paidInr: number; advanceRecoveredInr: number; carryForwardInr: number }[] = [];
    const skipped: { employeeId: string; reason: string }[] = [];
    for (const row of rows) {
      const e = info.get(row.employeeId);
      if (!e) { skipped.push({ employeeId: row.employeeId, reason: "not found or not active" }); continue; }
      if (e.payType === "DAILY") { skipped.push({ employeeId: e.id, reason: "paid by the day: use Pay what is owed" }); continue; }
      if (e.posted) { skipped.push({ employeeId: e.id, reason: `${monthLabel(month)} salary is already posted` }); continue; }
      const days = Number(row.days);
      if (!Number.isFinite(days) || days < 0 || days > 31) { skipped.push({ employeeId: e.id, reason: "days present must be 0 to 31" }); continue; }
      const earned = earnedForDays(e.monthlySalaryInr, days);
      const p = payrollNet(earned, e.carriedInr);
      const mode = row.mode === "UPI" || row.mode === "BANK" ? row.mode : "CASH";
      await prisma.$transaction(async (tx) => {
        await tx.employeeEntry.create({ data: { employeeId: e.id, date, month, type: "EARN", creditInr: earned, debitInr: 0, note: `${monthLabel(month)} salary, ${days} of ${MONTH_DAYS} days`, enteredBy: by } });
        if (p.net > 0) await tx.employeeEntry.create({ data: { employeeId: e.id, date, month, type: "PAY", creditInr: 0, debitInr: p.net, mode, note: `${monthLabel(month)} salary paid${p.advanceRecovered ? ` after taking off ₹${p.advanceRecovered} advance` : ""}`, enteredBy: by } });
        await tx.employeeEvent.create({ data: { employeeId: e.id, action: "PAYROLL", by, detail: { month, days, earned, carried: e.carriedInr, ...p } as never } });
      });
      done.push({ employeeId: e.id, name: e.name, earnedInr: earned, paidInr: p.net, advanceRecoveredInr: p.advanceRecovered, carryForwardInr: p.carryForward });
    }
    return { done, skipped };
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json(r.data);
}
