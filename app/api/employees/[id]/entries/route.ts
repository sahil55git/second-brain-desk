// Add a ledger entry for one employee (earned, bonus, advance, paid, deduction). Owner-only.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { validateEntry } from "@/lib/employeeLedger";
import { ownerGate } from "@/lib/employeeServer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  const blocked = ownerGate(user);
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  const v = validateEntry(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const date = v.date ?? businessDate(Date.now());
  const by = user!.name || "owner";
  const r = await safeDbCall(() =>
    prisma.$transaction(async (tx) => {
      const e = await tx.employee.findUnique({ where: { id: params.id } });
      if (!e) return null;
      const row = await tx.employeeEntry.create({
        data: { employeeId: e.id, date, month: date.slice(0, 7), type: v.type, creditInr: v.creditInr, debitInr: v.debitInr, mode: v.mode, note: v.note, enteredBy: by },
      });
      await tx.employeeEvent.create({ data: { employeeId: e.id, entryId: row.id, action: "ADD", by, detail: { type: v.type, amountInr: v.amountInr, mode: v.mode, date } } });
      return row;
    })
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  if (!r.data) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  return NextResponse.json({ data: { id: r.data.id } });
}
