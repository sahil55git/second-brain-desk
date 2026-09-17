import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";

// Edit — every intake field is editable after the fact (plan doc, Version 13).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
  if (seedKg !== undefined) data.seedKg = Number(seedKg);
  if (cakeOwnership !== undefined)
    data.cakeOwnership = cakeOwnership === "CUSTOMER" ? "CUSTOMER" : "SHOP";
  if (advanceCustomerInr !== undefined)
    data.advanceCustomerInr = Number(advanceCustomerInr) || 0;
  if (advanceAutoInr !== undefined)
    data.advanceAutoInr = Number(advanceAutoInr) || 0;
  if (cans !== undefined) data.cans = cans;
  if (notes !== undefined) data.notes = notes || null;

  const result = await safeDbCall(() =>
    prisma.jobWorkIntake.update({ where: { id: params.id }, data })
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data });
}
