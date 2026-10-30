// One employee: ledger for a month with opening balance and history (GET), edit details (PATCH). Owner-only.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { balanceOf, isMonth, round2, withRunning } from "@/lib/employeeLedger";
import { ENTRY_SELECT, currentMonth, ownerGate, shapeEmployee } from "@/lib/employeeServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  const blocked = ownerGate(user);
  if (blocked) return blocked;
  const m = req.nextUrl.searchParams.get("month");
  const month = isMonth(m) ? m : currentMonth();
  const r = await safeDbCall(async () => {
    const e = await prisma.employee.findUnique({ where: { id: params.id } });
    if (!e) return null;
    const live = await prisma.employeeEntry.findMany({ where: { employeeId: e.id, voidedAt: null }, orderBy: [{ date: "asc" }, { createdAt: "asc" }], select: { ...ENTRY_SELECT } });
    const events = await prisma.employeeEvent.findMany({ where: { employeeId: e.id }, orderBy: { at: "desc" }, take: 100 });
    return { e, live, events };
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  if (!r.data) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  const { e, live, events } = r.data;
  const before = live.filter((l) => l.month < month);
  const opening = balanceOf(before);
  const rows = withRunning(live.filter((l) => l.month === month), opening);
  const credit = round2(rows.reduce((a, l) => a + l.creditInr, 0));
  const debit = round2(rows.reduce((a, l) => a + l.debitInr, 0));
  return NextResponse.json({
    month,
    employee: shapeEmployee(e, live, month),
    openingInr: opening,
    creditInr: credit,
    debitInr: debit,
    closingInr: round2(opening + credit - debit),
    rows,
    months: Array.from(new Set([currentMonth(), ...live.map((l) => l.month)])).sort().reverse(),
    events: events.map((x) => ({ id: x.id, action: x.action, by: x.by, at: x.at, entryId: x.entryId, detail: x.detail })),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  const blocked = ownerGate(user);
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 80);
  if (typeof body.role === "string" && body.role.trim()) data.role = body.role.trim().slice(0, 60);
  if ("phone" in body) data.phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim().slice(0, 20) : null;
  if ("monthlySalaryInr" in body) {
    const s = Number(body.monthlySalaryInr);
    if (!Number.isFinite(s) || s <= 0 || s > 1_000_000) return NextResponse.json({ error: "Type the monthly salary in rupees." }, { status: 400 });
    data.monthlySalaryInr = round2(s);
  }
  if (typeof body.active === "boolean") data.active = body.active;
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  const by = user!.name || "owner";
  const r = await safeDbCall(() =>
    prisma.$transaction(async (tx) => {
      const old = await tx.employee.findUnique({ where: { id: params.id } });
      if (!old) return null;
      await tx.employee.update({ where: { id: params.id }, data });
      await tx.employeeEvent.create({ data: { employeeId: params.id, action: "EDIT_EMPLOYEE", by, detail: { from: { name: old.name, role: old.role, monthlySalaryInr: old.monthlySalaryInr, active: old.active }, to: data } as never } });
      return true;
    })
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  if (!r.data) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
