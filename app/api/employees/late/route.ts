// Late arrivals from attendance: who came after the shop's opening time (+ grace) on a day, and a
// one-tap way to put the usual deduction in their ledger. Owner-only. Nothing is deducted until the
// owner taps Apply, and the same person is never deducted twice for the same day.
//   GET  ?date=YYYY-MM-DD  → { settings, data: [{ employeeId, name, inAt, minutes, amountInr, note, done }] }
//   POST { date, employeeIds: string[] } → deducts the suggested amount for each (those not done yet)
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { ownerGate } from "@/lib/employeeServer";
import { cleanSettings, lateSuggestions, lateTag } from "@/lib/staffRules";

export const dynamic = "force-dynamic";

async function load(date: string) {
  const [s, att, emps, done] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: "staffRules" } }),
    prisma.attendance.findMany({ where: { date }, select: { employeeId: true, inAt: true, status: true } }),
    prisma.employee.findMany({ where: { active: true }, select: { id: true, name: true } }),
    prisma.employeeEntry.findMany({ where: { date, type: "CUT", voidedAt: null, note: { contains: lateTag(date) } }, select: { employeeId: true } }),
  ]);
  const settings = cleanSettings(s?.data);
  const names = Object.fromEntries(emps.map((e) => [e.id, e.name]));
  const list = lateSuggestions(att.map((a) => ({ employeeId: a.employeeId, inAt: a.inAt ? a.inAt.toISOString() : null, status: a.status })), names, settings, date, new Set(done.map((d) => d.employeeId)));
  return { settings, list };
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  const blocked = ownerGate(user);
  if (blocked) return blocked;
  const d = req.nextUrl.searchParams.get("date");
  const date = isValidDate(d) ? d : businessDate(Date.now());
  const r = await safeDbCall(() => load(date));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ date, settings: r.data.settings, data: r.data.list });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  const blocked = ownerGate(user);
  if (blocked) return blocked;
  const b = await req.json().catch(() => ({}));
  const date = isValidDate(b.date) ? b.date : businessDate(Date.now());
  const ids = new Set<string>(Array.isArray(b.employeeIds) ? b.employeeIds.filter((x: unknown): x is string => typeof x === "string") : []);
  if (!ids.size) return NextResponse.json({ error: "Choose who to deduct." }, { status: 400 });
  const by = user!.name || "owner";
  const r = await safeDbCall(async () => {
    const { list } = await load(date);
    const todo = list.filter((x) => ids.has(x.employeeId) && !x.done && x.amountInr > 0);
    await prisma.$transaction(async (tx) => {
      for (const x of todo) {
        const row = await tx.employeeEntry.create({
          data: { employeeId: x.employeeId, date, month: date.slice(0, 7), type: "CUT", creditInr: 0, debitInr: x.amountInr, mode: null, note: x.note, enteredBy: by },
        });
        await tx.employeeEvent.create({ data: { employeeId: x.employeeId, entryId: row.id, action: "ADD", by, detail: { type: "CUT", amountInr: x.amountInr, date, reason: "late" } } });
      }
    });
    return todo.length;
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: { applied: r.data } });
}
