import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { defaultPaySplit, expectedSettlementWithRate, STANDARD_RATE } from "@/lib/calculations";
import { parseMoney, parsePositive, staffRateOk } from "@/lib/editRules";
import { rupees, writeAudit } from "@/lib/auditServer";

const given = (v: unknown) => v !== undefined && v !== null && v !== "";

// Inline settle/pay (plan doc, Versions 11-14): customer/auto split,
// optional rate override. Body may supply an explicit {customer, auto}
// split (fully overwritable per the doc) or omit it to use the computed
// default split. Any split is accepted (Sahil's decision, 2026-11-10); only
// the numbers themselves are checked.
//
// Spec A guards: an entry that is already paid can be paid again only by the
// owner (logged as RESETTLE); staff may use the standard rate give or take
// ₹1/kg, the owner any rate. The "already paid?" check and the write happen in
// one transaction and the write only lands if the entry is still in the state
// that was checked, so a double tap cannot overwrite the first amounts.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json();
  const { ratePerKg, settlementCustomerInr, settlementAutoInr } = body;

  let rateOverride: number | null = null;
  if (given(ratePerKg)) {
    rateOverride = parsePositive(ratePerKg);
    if (rateOverride === null) {
      return NextResponse.json({ error: "Rate must be a number above zero." }, { status: 400 });
    }
  }
  let customerOverride: number | null = null;
  if (given(settlementCustomerInr)) {
    customerOverride = parseMoney(settlementCustomerInr);
    if (customerOverride === null) {
      return NextResponse.json({ error: "Amounts cannot be negative or invalid." }, { status: 400 });
    }
  }
  let autoOverride: number | null = null;
  if (given(settlementAutoInr)) {
    autoOverride = parseMoney(settlementAutoInr);
    if (autoOverride === null) {
      return NextResponse.json({ error: "Amounts cannot be negative or invalid." }, { status: 400 });
    }
  }

  const result = await safeDbCall(() =>
    prisma.$transaction(async (tx) => {
      const entry = await tx.jobWorkIntake.findUnique({ where: { id: params.id } });
      if (!entry) return { kind: "missing" as const };
      if (entry.settled && !user.isOwner) return { kind: "paid" as const };

      const standard = STANDARD_RATE[entry.cakeOwnership as "SHOP" | "CUSTOMER"];
      const rate = rateOverride ?? standard;
      if (!user.isOwner && !staffRateOk(rate, standard)) return { kind: "rate" as const };

      const entryLike = {
        seedKg: entry.seedKg,
        cakeOwnership: entry.cakeOwnership as "SHOP" | "CUSTOMER",
        advanceCustomerInr: entry.advanceCustomerInr,
        advanceAutoInr: entry.advanceAutoInr,
        cans: entry.cans as Record<string, { qty: number; rate: number }> | null,
      };

      const due = expectedSettlementWithRate(entryLike, rate);
      const defaultSplit = defaultPaySplit(entryLike, rate);
      const customer = customerOverride ?? defaultSplit.customer;
      const auto = autoOverride ?? defaultSplit.auto;

      const claim = await tx.jobWorkIntake.updateMany({
        where: { id: params.id, settled: entry.settled },
        data: {
          settled: true,
          settlementCustomerInr: customer,
          settlementAutoInr: auto,
          settlementRatePerKg: rate,
          settlementAmountInr: customer + auto,
          settledAt: new Date(),
        },
      });
      if (claim.count === 0) return { kind: "changed" as const };

      const after = await tx.jobWorkIntake.findUniqueOrThrow({ where: { id: params.id } });
      await writeAudit(
        tx,
        user,
        entry.settled ? "RESETTLE" : "SETTLE",
        "JobWorkIntake",
        after.id,
        `${after.customer} ${after.seedKg} kg @ ₹${rate}/kg paid ${rupees(customer + auto)}`,
        entry,
        after
      );
      return { kind: "done" as const, row: after, due };
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
        { error: "This entry is already paid. Only the owner can pay it again." },
        { status: 403 }
      );
    case "rate":
      return NextResponse.json(
        { error: "Only the owner can change the rate." },
        { status: 403 }
      );
    case "changed":
      return NextResponse.json(
        { error: "This entry was just changed or paid by someone else. Reload and try again." },
        { status: 409 }
      );
  }
  return NextResponse.json({ data: result.data.row, due: result.data.due });
}
