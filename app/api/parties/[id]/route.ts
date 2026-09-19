import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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
    active,
  } = body;

  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return NextResponse.json({ error: "name must not be empty" }, { status: 400 });
  }

  const result = await safeDbCall(() =>
    prisma.party.update({
      where: { id: params.id },
      data: {
        ...(type !== undefined && {
          type: type === "SUPPLIER" || type === "BOTH" ? type : "CUSTOMER",
        }),
        ...(name !== undefined && { name: name.trim() }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(email !== undefined && { email: email || null }),
        ...(gstin !== undefined && { gstin: gstin || null }),
        ...(address !== undefined && { address: address || null }),
        ...(state !== undefined && { state: state || null }),
        ...(openingBalanceInr !== undefined && {
          openingBalanceInr: Number(openingBalanceInr) || 0,
        }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(active !== undefined && { active: !!active }),
      },
    })
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  // Soft-delete only — never hard-delete a party that may already be
  // referenced by Sales/Purchase records once Phase 2 lands.
  const result = await safeDbCall(() =>
    prisma.party.update({ where: { id: params.id }, data: { active: false } })
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data });
}
