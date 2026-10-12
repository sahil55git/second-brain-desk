// Udhaar balances and open credit bills for the Parties desk. Built on the
// same report logic as the Reports page, so both show the same numbers.
import { NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { businessDate } from "@/lib/register";
import { udhaarReport, type BizData, type RefundRecord } from "@/lib/bizReports";

export const dynamic = "force-dynamic";

export async function GET() {
  const today = businessDate(Date.now());
  const result = await safeDbCall(async () => {
    const [sales, returns, register] = await Promise.all([
      prisma.salesInvoice.findMany({
        where: { paymentMode: "CREDIT" },
        include: { lineItems: true, party: { select: { id: true, name: true } } },
        orderBy: { date: "asc" },
      }),
      prisma.salesReturn.findMany({
        orderBy: { createdAt: "desc" },
        include: { invoice: { select: { id: true, invoiceNo: true, paymentMode: true, party: { select: { name: true } } } } },
      }),
      prisma.registerEntry.findMany({
        where: { OR: [{ kind: "UDHAAR_IN" }, { kind: { in: ["SALE", "FRESH_CRUSH"] }, paymentMode: "CREDIT" }] },
      }),
    ]);
    const refunds: RefundRecord[] = returns.map((r) => ({
      id: r.id,
      invoiceId: r.invoiceId,
      invoiceNo: r.invoice.invoiceNo,
      date: businessDate(r.createdAt),
      partyName: r.invoice.party?.name || "Walk-in",
      paymentMode: r.invoice.paymentMode,
      amount: r.refundInr,
      reason: r.reason,
    }));
    const data = {
      sales,
      purchases: [],
      expenses: [],
      register,
      jobWork: [],
      mfg: [],
      closings: [],
      items: [],
      refunds,
    } as unknown as BizData;
    return udhaarReport(data, today);
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: { ...result.data, today } });
}
