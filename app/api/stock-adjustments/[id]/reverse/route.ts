// Undo a stock correction by adding a REVERSAL entry. The original is never edited.
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { businessDate } from "@/lib/register";
import { reversalFor, type AdjustRecord } from "@/lib/stockAdjust";
import { currentBookQty } from "@/lib/stockBookServer";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const orig = await safeDbCall(() => prisma.stockAdjustment.findUnique({ where: { id: params.id } }));
  if (!orig.ok) return NextResponse.json({ error: orig.error }, { status: 503 });
  if (!orig.data) return NextResponse.json({ error: "Correction not found." }, { status: 404 });

  const existing = await safeDbCall(() => prisma.stockAdjustment.findFirst({ where: { reversesId: params.id } }));
  if (!existing.ok) return NextResponse.json({ error: existing.error }, { status: 503 });

  const o = orig.data;
  const rec: AdjustRecord = {
    id: o.id, itemId: o.itemId, date: o.date, bookQty: o.bookQty, actualQty: o.actualQty,
    qtyDelta: o.qtyDelta, reason: o.reason as AdjustRecord["reason"], note: o.note, reversesId: o.reversesId,
  };
  if (existing.data) return NextResponse.json({ error: "This correction has already been undone." }, { status: 400 });
  const plan = reversalFor(rec, []);
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 });

  const current = await safeDbCall(() => currentBookQty(o.itemId));
  if (!current.ok) return NextResponse.json({ error: current.error }, { status: 503 });
  const bookQty = current.data?.book ?? 0;

  try {
    const created = await prisma.stockAdjustment.create({
      data: {
        date: businessDate(Date.now()),
        itemId: o.itemId,
        bookQty,
        actualQty: Math.round((bookQty + plan.qtyDelta) * 1000) / 1000,
        qtyDelta: plan.qtyDelta,
        reason: "REVERSAL",
        note: `Undo of correction ${o.id}`,
        reversesId: o.id,
      },
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (e) {
    // Two undos at once: the unique reversesId stops the second one.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "This correction has already been undone." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not undo the correction." }, { status: 503 });
  }
}
