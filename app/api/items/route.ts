import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { writeAudit } from "@/lib/auditServer";

export async function GET() {
  const result = await safeDbCall(() =>
    prisma.item.findMany({ orderBy: { createdAt: "desc" } })
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data });
}

// Owner only: staff do not add items. The new item is written to the audit log.
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!user.isOwner) {
    return NextResponse.json({ error: "Only the owner can add an item." }, { status: 403 });
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
  } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const result = await safeDbCall(() =>
    prisma.$transaction(async (tx) => {
      const created = await tx.item.create({
        data: {
          name: name.trim(),
          sku: sku || null,
          unit: unit && typeof unit === "string" ? unit : "kg",
          hsnCode: hsnCode || null,
          gstRatePct: gstRatePct === undefined || gstRatePct === null || gstRatePct === "" ? null : Number(gstRatePct),
          barcode: barcode || null,
          openingStockQty: Number(openingStockQty) || 0,
          reorderLevelQty:
            reorderLevelQty === undefined || reorderLevelQty === null || reorderLevelQty === ""
              ? null
              : Number(reorderLevelQty),
          notes: notes || null,
        },
      });
      await writeAudit(tx, user, "CREATE", "Item", created.id, created.name, undefined, created);
      return created;
    })
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}
