import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";

export async function GET() {
  const result = await safeDbCall(() =>
    prisma.jobWorkIntake.findMany({ orderBy: { createdAt: "desc" } })
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data });
}

export async function POST(req: NextRequest) {
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

  if (!customer || typeof customer !== "string") {
    return NextResponse.json({ error: "customer is required" }, { status: 400 });
  }
  if (typeof seedKg !== "number" || seedKg <= 0) {
    return NextResponse.json({ error: "seedKg must be a positive number" }, { status: 400 });
  }

  const result = await safeDbCall(() =>
    prisma.jobWorkIntake.create({
      data: {
        customer,
        vehicleNo: vehicleNo || null,
        seedKg,
        cakeOwnership: cakeOwnership === "CUSTOMER" ? "CUSTOMER" : "SHOP",
        advanceCustomerInr: Number(advanceCustomerInr) || 0,
        advanceAutoInr: Number(advanceAutoInr) || 0,
        cans: cans || {},
        notes: notes || null,
      },
    })
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}
