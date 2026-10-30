// Employees: list with balances (GET) and add one (POST). Owner-only.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { isDate, isMonth, round2 } from "@/lib/employeeLedger";
import { currentMonth, ownerGate, shapeEmployee } from "@/lib/employeeServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  const blocked = ownerGate(user);
  if (blocked) return blocked;
  const m = req.nextUrl.searchParams.get("month");
  const month = isMonth(m) ? m : currentMonth();
  const r = await safeDbCall(() =>
    prisma.employee.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { entries: { where: { voidedAt: null }, select: { creditInr: true, debitInr: true, month: true, type: true, date: true } } },
    })
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ month, data: r.data.map((e) => shapeEmployee(e, e.entries, month)) });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  const blocked = ownerGate(user);
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return NextResponse.json({ error: "Write the person's name." }, { status: 400 });
  const salary = Number(body.monthlySalaryInr);
  if (!Number.isFinite(salary) || salary <= 0 || salary > 1_000_000) return NextResponse.json({ error: "Type the monthly salary in rupees." }, { status: 400 });
  const role = typeof body.role === "string" && body.role.trim() ? body.role.trim().slice(0, 60) : "Staff";
  const phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim().slice(0, 20) : null;
  const joinDate = isDate(body.joinDate) ? body.joinDate : businessDate(Date.now());
  const opening = Number(body.openingBalanceInr) || 0; // negative = an advance already given
  const by = user!.name || "owner";

  const r = await safeDbCall(() =>
    prisma.$transaction(async (tx) => {
      const e = await tx.employee.create({ data: { name, role, phone, monthlySalaryInr: round2(salary), joinDate } });
      if (opening !== 0) {
        await tx.employeeEntry.create({
          data: { employeeId: e.id, date: joinDate, month: joinDate.slice(0, 7), type: "OPEN", creditInr: opening > 0 ? round2(opening) : 0, debitInr: opening < 0 ? round2(-opening) : 0, note: "Opening balance", enteredBy: by },
        });
      }
      await tx.employeeEvent.create({ data: { employeeId: e.id, action: "CREATE", by, detail: { name, role, monthlySalaryInr: salary, opening } } });
      return e;
    })
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: { id: r.data.id } });
}
