// The rows the Reports hub (and the home page / phone widgets) add up: every sale, purchase,
// register entry... up to `to`, expenses from `from`. Shared by /api/reports/hub and
// /api/device/summary so both always count the same way.
import { prisma } from "@/lib/db";
import { businessDate } from "@/lib/register";

export async function loadHubData(from: string, to: string) {
    const [sales, purchases, expenses, register, jobWork, mfg, closings, items, returns, adjustments] = await Promise.all([
      prisma.salesInvoice.findMany({
        where: { date: { lte: to } },
        include: { lineItems: true, party: { select: { id: true, name: true } } },
        orderBy: { date: "desc" },
      }),
      prisma.purchaseBill.findMany({
        where: { date: { lte: to } },
        include: { lineItems: true, party: { select: { id: true, name: true } } },
        orderBy: { date: "desc" },
      }),
      prisma.expense.findMany({
        where: { date: { gte: from, lte: to } },
        include: { party: { select: { id: true, name: true } } },
        orderBy: { date: "desc" },
      }),
      prisma.registerEntry.findMany({ where: { date: { lte: to } }, orderBy: { createdAt: "desc" } }),
      prisma.jobWorkIntake.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.mfgBatch.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.dailyClosing.findMany({ where: { date: { lte: to } }, orderBy: { createdAt: "desc" }, take: 400 }),
      prisma.item.findMany({ orderBy: { name: "asc" } }),
      prisma.salesReturn.findMany({
        orderBy: { createdAt: "desc" },
        include: { invoice: { select: { id: true, invoiceNo: true, paymentMode: true, party: { select: { name: true } } } } },
      }),
      // Until the StockAdjustment table is created, reports still load without corrections.
      prisma.stockAdjustment.findMany({ where: { date: { lte: to } }, orderBy: { createdAt: "desc" } }).catch(() => []),
    ]);
    const adjustmentRecords = adjustments.map((a) => ({
      id: a.id,
      itemId: a.itemId,
      date: a.date,
      bookQty: a.bookQty,
      actualQty: a.actualQty,
      qtyDelta: a.qtyDelta,
      reason: a.reason as "REVERSAL",
      note: a.note,
      reversesId: a.reversesId,
    }));
    const refunds = returns.map((r) => ({
      id: r.id,
      invoiceId: r.invoiceId,
      invoiceNo: r.invoice.invoiceNo,
      date: businessDate(r.createdAt),
      partyName: r.invoice.party?.name || "Walk-in",
      paymentMode: r.invoice.paymentMode,
      amount: r.refundInr,
      reason: r.reason,
    }));
    return { sales, purchases, expenses, register, jobWork, mfg, closings, items, refunds, adjustments: adjustmentRecords };
}
