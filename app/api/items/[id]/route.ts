import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { writeAudit } from "@/lib/auditServer";

// Owner only. Every change is logged with the row before and after.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!user.isOwner) {
    return NextResponse.json({ error: "Only the owner can change an item." }, { status: 403 });
  }

  const body = await req.json();
  const {
    name,
    sku,
    unit,
    hsnCode,
    gstRatePct,
    barcode,
    openingStockQty,
    reorderLevelQty,
    notes,
    active,
  } = body;

  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return NextResponse.json({ error: "name must not be empty" }, { status: 400 });
  }

  const result = await safeDbCall(() =>
    prisma.$transaction(async (tx) => {
      const before = await tx.item.findUnique({ where: { id: params.id } });
      if (!before) return null;
      const after = await tx.item.update({
        where: { id: params.id },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(sku !== undefined && { sku: sku || null }),
          ...(unit !== undefined && { unit: unit || "kg" }),
          ...(hsnCode !== undefined && { hsnCode: hsnCode || null }),
          ...(gstRatePct !== undefined && {
            gstRatePct: gstRatePct === null || gstRatePct === "" ? null : Number(gstRatePct),
          }),
          ...(barcode !== undefined && { barcode: barcode || null }),
          ...(openingStockQty !== undefined && {
            openingStockQty: Number(openingStockQty) || 0,
          }),
          ...(reorderLevelQty !== undefined && {
            reorderLevelQty:
              reorderLevelQty === null || reorderLevelQty === "" ? null : Number(reorderLevelQty),
          }),
          ...(notes !== undefined && { notes: notes || null }),
          ...(active !== undefined && { active: !!active }),
        },
      });
      await writeAudit(tx, user, "EDIT", "Item", after.id, after.name, before, after);
      return after;
    })
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  if (!result.data) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  return NextResponse.json({ data: result.data });
}

// Owner only.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!user.isOwner) {
    return NextResponse.json({ error: "Only the owner can remove an item." }, { status: 403 });
  }

  // Soft-delete only — Sales/Purchase (Phase 2) and POS (Phase 3) will
  // reference items by id, so a hard delete could orphan history.
  const result = await safeDbCall(() =>
    prisma.$transaction(async (tx) => {
      const before = await tx.item.findUnique({ where: { id: params.id } });
      if (!before) return null;
      const after = await tx.item.update({ where: { id: params.id }, data: { active: false } });
      await writeAudit(tx, user, "DELETE", "Item", after.id, after.name, before, after);
      return after;
    })
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  if (!result.data) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  return NextResponse.json({ data: result.data });
}
