// Reports hub data — Owner only (financial totals), checked server-side.
// Returns the raw rows the pure functions in lib/bizReports.ts aggregate,
// so the browser can switch tabs / ranges / CSVs without new round trips.
// History needed for "as of" figures (stock, udhaar, job-work dues) is
// loaded in full; date-only lists are limited to the requested span.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!user.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!isValidDate(from) || !isValidDate(to) || from > to) {
    return NextResponse.json({ error: "from/to=YYYY-MM-DD are required" }, { status: 400 });
  }

  const result = await safeDbCall(async () => {
    const [sales, purchases, expenses, register, jobWork, mfg, closings, items, returns] = await Promise.all([
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
    ]);
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
    return { sales, purchases, expenses, register, jobWork, mfg, closings, items, refunds };
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data, loadedAt: new Date().toISOString() });
}
