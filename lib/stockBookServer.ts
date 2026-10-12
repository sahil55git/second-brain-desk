// Server-side book quantity for one item, read at the moment a correction is made.
import { prisma } from "@/lib/db";
import { bookQtyFor } from "@/lib/stockAdjust";

export async function currentBookQty(itemId: string): Promise<{ book: number; openingStockQty: number } | null> {
  const item = await prisma.item.findUnique({ where: { id: itemId }, select: { openingStockQty: true } });
  if (!item) return null;
  const [purchased, sold, adj] = await Promise.all([
    prisma.purchaseLineItem.aggregate({ where: { itemId }, _sum: { qty: true } }),
    prisma.salesLineItem.findMany({ where: { itemId }, select: { qty: true, returnedQty: true } }),
    prisma.stockAdjustment.aggregate({ where: { itemId }, _sum: { qtyDelta: true } }),
  ]);
  const soldKept = sold.reduce((s: number, l: { qty: number; returnedQty: number | null }) => s + (l.qty - (l.returnedQty ?? 0)), 0);
  const book = bookQtyFor(itemId, {
    openingStockQty: item.openingStockQty,
    purchaseQty: purchased._sum.qty ?? 0,
    soldKeptQty: soldKept,
    adjustments: [{ itemId, qtyDelta: adj._sum.qtyDelta ?? 0 }],
  });
  return { book, openingStockQty: item.openingStockQty };
}
