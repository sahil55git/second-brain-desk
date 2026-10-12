// Stock corrections — each one is a new entry. Book quantity is read on the server.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { businessDate } from "@/lib/register";
import { deltaFor, validateCorrection } from "@/lib/stockAdjust";
import { currentBookQty } from "@/lib/stockBookServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const itemId = req.nextUrl.searchParams.get("itemId") || undefined;
  // ?itemId=…&book=1 returns the item's current book quantity, read on the server.
  if (itemId && req.nextUrl.searchParams.get("book") === "1") {
    const b = await safeDbCall(() => currentBookQty(itemId));
    if (!b.ok) return NextResponse.json({ error: b.error }, { status: 503 });
    if (!b.data) return NextResponse.json({ error: "That item no longer exists." }, { status: 404 });
    return NextResponse.json({ data: { book: b.data.book } });
  }
  const result = await safeDbCall(() =>
    prisma.stockAdjustment.findMany({
      where: itemId ? { itemId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { item: { select: { name: true, unit: true } } },
    })
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  if (!itemId) return NextResponse.json({ error: "Choose an item." }, { status: 400 });

  const v = validateCorrection({ actualQty: body.actualQty, reason: body.reason, note: body.note });
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : businessDate(Date.now());

  const current = await safeDbCall(() => currentBookQty(itemId));
  if (!current.ok) return NextResponse.json({ error: current.error }, { status: 503 });
  if (!current.data) return NextResponse.json({ error: "That item no longer exists." }, { status: 404 });

  const bookQty = current.data.book;
  const qtyDelta = deltaFor(bookQty, v.actualQty);
  if (qtyDelta === null) {
    return NextResponse.json({ error: "The count matches the book, so there is nothing to correct." }, { status: 400 });
  }

  const created = await safeDbCall(() =>
    prisma.stockAdjustment.create({
      data: { date, itemId, bookQty, actualQty: v.actualQty, qtyDelta, reason: v.reason as never, note: v.note },
    })
  );
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: 503 });
  return NextResponse.json({ data: created.data }, { status: 201 });
}
