import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { defaultPaySplit, expectedSettlementWithRate, STANDARD_RATE } from "@/lib/calculations";

// Inline settle/pay (plan doc, Versions 11-14): customer/auto split,
// optional rate override. Body may supply an explicit {customer, auto}
// split (fully overwritable per the doc) or omit it to use the computed
// default split.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const { ratePerKg, settlementCustomerInr, settlementAutoInr } = body;

  const entryResult = await safeDbCall(() =>
    prisma.jobWorkIntake.findUniqueOrThrow({ where: { id: params.id } })
  );
  if (!entryResult.ok) {
    return NextResponse.json({ error: entryResult.error }, { status: 503 });
  }
  const entry = entryResult.data;

  const rate = typeof ratePerKg === "number" && ratePerKg > 0
    ? ratePerKg
    : STANDARD_RATE[entry.cakeOwnership as "SHOP" | "CUSTOMER"];

  const entryLike = {
    seedKg: entry.seedKg,
    cakeOwnership: entry.cakeOwnership as "SHOP" | "CUSTOMER",
    advanceCustomerInr: entry.advanceCustomerInr,
    advanceAutoInr: entry.advanceAutoInr,
    cans: entry.cans as Record<string, { qty: number; rate: number }> | null,
  };

  const due = expectedSettlementWithRate(entryLike, rate);
  const defaultSplit = defaultPaySplit(entryLike, rate);

  const customer =
    typeof settlementCustomerInr === "number" ? settlementCustomerInr : defaultSplit.customer;
  const auto =
    typeof settlementAutoInr === "number" ? settlementAutoInr : defaultSplit.auto;

  const result = await safeDbCall(() =>
    prisma.jobWorkIntake.update({
      where: { id: params.id },
      data: {
        settled: true,
        settlementCustomerInr: customer,
        settlementAutoInr: auto,
        settlementRatePerKg: rate,
        settlementAmountInr: customer + auto,
        settledAt: new Date(),
      },
    })
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data, due });
}
