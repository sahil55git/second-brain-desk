import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { canEdit, parseMoney, parsePositive } from "@/lib/editRules";
import { writeAudit } from "@/lib/auditServer";

// Edit — every intake field is editable after the fact (plan doc, Version 13).
//
// Spec A guards: staff may fix an unpaid entry made today; a paid (settled)
// entry, or an entry from an earlier day, is the owner's alone, because the
// seed kg decides the cash payout. Seed kg must be a number above zero and
// advances cannot be negative. Every edit is logged with the row before and after.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json();
  const {
    customer,
    vehicleNo,
    seedKg,
    cakeOwnership,
    advanceCustomerInr,
    advanceAutoInr,
    cans,
    notes,
  } = body;

  const data: Record<string, unknown> = {};
  if (customer !== undefined) data.customer = customer;
  if (vehicleNo !== undefined) data.vehicleNo = vehicleNo || null;
  if (seedKg !== undefined) {
    const kg = parsePositive(seedKg);
    if (kg === null) {
      return NextResponse.json({ error: "Seed kg must be a number above zero." }, { status: 400 });
    }
    data.seedKg = kg;
  }
  if (cakeOwnership !== undefined)
    data.cakeOwnership = cakeOwnership === "CUSTOMER" ? "CUSTOMER" : "SHOP";
  if (advanceCustomerInr !== undefined) {
    const v = parseMoney(advanceCustomerInr);
    if (v === null) {
      return NextResponse.json({ error: "Advance cannot be negative." }, { status: 400 });
    }
    data.advanceCustomerInr = v;
  }
  if (advanceAutoInr !== undefined) {
    const v = parseMoney(advanceAutoInr);
    if (v === null) {
      return NextResponse.json({ error: "Advance cannot be negative." }, { status: 400 });
    }
    data.advanceAutoInr = v;
  }
  if (cans !== undefined) data.cans = cans;
  if (notes !== undefined) data.notes = notes || null;

  const today = businessDate(Date.now());
  const result = await safeDbCall(() =>
    prisma.$transaction(async (tx) => {
      const before = await tx.jobWorkIntake.findUnique({ where: { id: params.id } });
      if (!before) return { kind: "missing" as const };
      if (before.settled && !user.isOwner) return { kind: "paid" as const };
      if (!canEdit(user, businessDate(before.createdAt), today)) return { kind: "old" as const };

      // The change only lands if the entry is still in the state we checked. A
      // payment that went through a moment ago (settled flipped) gives count 0.
      const claim = await tx.jobWorkIntake.updateMany({
        where: { id: params.id, settled: before.settled },
        // `data` is built dynamically (only the fields the caller sent), so it's
        // typed as a loose Record rather than Prisma's exact update-input type —
        // cast at the call site rather than fighting Prisma's generated types.
        data: data as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      });
      if (claim.count === 0) return { kind: "changed" as const };

      const after = await tx.jobWorkIntake.findUniqueOrThrow({ where: { id: params.id } });
      await writeAudit(
        tx,
        user,
        "EDIT",
        "JobWorkIntake",
        after.id,
        `${after.customer} ${after.seedKg} kg ${businessDate(after.createdAt)}`,
        before,
        after
      );
      return { kind: "done" as const, row: after };
    })
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  switch (result.data.kind) {
    case "missing":
      return NextResponse.json({ error: "Job-work entry not found" }, { status: 404 });
    case "paid":
      return NextResponse.json(
        { error: "This entry is already paid. Only the owner can change it." },
        { status: 403 }
      );
    case "old":
      return NextResponse.json(
        { error: "Only the owner can change an entry from an earlier day." },
        { status: 403 }
      );
    case "changed":
      return NextResponse.json(
        { error: "This entry was just changed or paid by someone else. Reload and try again." },
        { status: 409 }
      );
  }
  return NextResponse.json({ data: result.data.row });
}
