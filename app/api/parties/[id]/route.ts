import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { writeAudit } from "@/lib/auditServer";

// Any signed-in user may fix a party's details; every change is logged with
// the row before and after.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

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
    prisma.$transaction(async (tx) => {
      const before = await tx.party.findUnique({ where: { id: params.id } });
      if (!before) return null;
      const after = await tx.party.update({
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
      });
      await writeAudit(tx, user, "EDIT", "Party", after.id, after.name, before, after);
      return after;
    })
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  if (!result.data) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  return NextResponse.json({ data: result.data });
}

// Owner only.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!user.isOwner) {
    return NextResponse.json({ error: "Only the owner can remove a party." }, { status: 403 });
  }

  // Soft-delete only — never hard-delete a party that may already be
  // referenced by Sales/Purchase records once Phase 2 lands.
  const result = await safeDbCall(() =>
    prisma.$transaction(async (tx) => {
      const before = await tx.party.findUnique({ where: { id: params.id } });
      if (!before) return null;
      const after = await tx.party.update({ where: { id: params.id }, data: { active: false } });
      await writeAudit(tx, user, "DELETE", "Party", after.id, after.name, before, after);
      return after;
    })
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  if (!result.data) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  return NextResponse.json({ data: result.data });
}
