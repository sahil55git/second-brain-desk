import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";

export async function GET() {
  const result = await safeDbCall(() =>
    prisma.party.findMany({ orderBy: { createdAt: "desc" } })
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    type,
    name,
    phone,
    email,
    gstin,
    address,
    state,
    openingBalanceInr,
    notes,
  } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const result = await safeDbCall(() =>
    prisma.party.create({
      data: {
        type: type === "SUPPLIER" || type === "BOTH" ? type : "CUSTOMER",
        name: name.trim(),
        phone: phone || null,
        email: email || null,
        gstin: gstin || null,
        address: address || null,
        state: state || null,
        openingBalanceInr: Number(openingBalanceInr) || 0,
        notes: notes || null,
      },
    })
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}
