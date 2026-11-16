import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { claimOp, releaseOp } from "@/lib/clientOp";

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
  // Who entered it. Not required here (the page-level login already gates this route).
  const user = await getUser(req);

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

  // an intake kept offline and sent again must not become a second intake (phantom seed on the books)
  if ((await claimOp(body.clientId, "jobwork.intake")) === "duplicate") return NextResponse.json({ data: null, duplicate: true, message: "Already saved." }, { status: 200 });

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
        createdByName: user?.name ?? null,
      },
    })
  );

  if (!result.ok) {
    await releaseOp(body.clientId);
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}
