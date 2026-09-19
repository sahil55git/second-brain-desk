import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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
    prisma.item.update({
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
    })
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  // Soft-delete only — Sales/Purchase (Phase 2) and POS (Phase 3) will
  // reference items by id, so a hard delete could orphan history.
  const result = await safeDbCall(() =>
    prisma.item.update({ where: { id: params.id }, data: { active: false } })
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data });
}
