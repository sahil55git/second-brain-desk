// Change or delete one ledger entry. Both need a reason; nothing is ever wiped:
// an edit keeps the old figure in the history, a delete only marks the entry void. Owner-only.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { ENTRY_TYPES, validateEntry, validateReason } from "@/lib/employeeLedger";
import { ownerGate } from "@/lib/employeeServer";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; entryId: string } }) {
  const user = await getUser(req);
  const blocked = ownerGate(user);
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  const why = validateReason(body.reason);
  if (!why.ok) return NextResponse.json({ error: why.error }, { status: 400 });
  const by = user!.name || "owner";
  const r = await safeDbCall(() =>
    prisma.$transaction(async (tx) => {
      const old = await tx.employeeEntry.findFirst({ where: { id: params.entryId, employeeId: params.id, voidedAt: null } });
      if (!old) return { error: "Entry not found.", status: 404 } as const;
      if (old.type === "OPEN") return { error: "The opening balance can only be deleted and entered again.", status: 400 } as const;
      const v = validateEntry({ type: body.type ?? old.type, amountInr: body.amountInr ?? (old.creditInr || old.debitInr), mode: body.mode ?? old.mode, note: "note" in body ? body.note : old.note, date: body.date ?? old.date });
      if (!v.ok) return { error: v.error, status: 400 } as const;
      const date = v.date ?? old.date;
      const data = { date, month: date.slice(0, 7), type: v.type, creditInr: v.creditInr, debitInr: v.debitInr, mode: ENTRY_TYPES[v.type].moves ? v.mode : null, note: v.note, editNote: `edited: ${why.reason}` };
      await tx.employeeEntry.update({ where: { id: old.id }, data });
      await tx.employeeEvent.create({
        data: { employeeId: params.id, entryId: old.id, action: "EDIT", by, detail: { reason: why.reason, from: { type: old.type, creditInr: old.creditInr, debitInr: old.debitInr, date: old.date, mode: old.mode, note: old.note }, to: { type: v.type, creditInr: v.creditInr, debitInr: v.debitInr, date, mode: data.mode, note: v.note } } as never },
      });
      return { ok: true } as const;
    })
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  if ("error" in r.data) return NextResponse.json({ error: r.data.error }, { status: r.data.status });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; entryId: string } }) {
  const user = await getUser(req);
  const blocked = ownerGate(user);
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  const why = validateReason(body.reason);
  if (!why.ok) return NextResponse.json({ error: why.error }, { status: 400 });
  const by = user!.name || "owner";
  const r = await safeDbCall(() =>
    prisma.$transaction(async (tx) => {
      const old = await tx.employeeEntry.findFirst({ where: { id: params.entryId, employeeId: params.id, voidedAt: null } });
      if (!old) return false;
      await tx.employeeEntry.update({ where: { id: old.id }, data: { voidedAt: new Date(), voidedBy: by, voidReason: why.reason } });
      await tx.employeeEvent.create({ data: { employeeId: params.id, entryId: old.id, action: "VOID", by, detail: { reason: why.reason, type: old.type, creditInr: old.creditInr, debitInr: old.debitInr, date: old.date, note: old.note } as never } });
      return true;
    })
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  if (!r.data) return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
