// What the shop owes each supplier (lib/payables.ts). Read-only and owner-only: it adds up
// credit purchase bills, credit purchases in the Quick Register and supplier payments.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { payables, type PayBill, type PayPayment } from "@/lib/payables";

export const dynamic = "force-dynamic";

interface BillRow { id: string; billNo: string; date: string; totalInr: number; partyId: string }
interface RegRow { id: string; date: string; amountInr: number; partyId: string | null; partyName: string | null; item: string | null; itemLabel: string | null }

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!user.isOwner) return NextResponse.json({ error: "Only the owner can see what is owed to suppliers." }, { status: 403 });

  const billsRes = await safeDbCall<BillRow[]>(() =>
    prisma.purchaseBill.findMany({ where: { paymentMode: "CREDIT" }, select: { id: true, billNo: true, date: true, totalInr: true, partyId: true } })
  );
  if (!billsRes.ok) return NextResponse.json({ error: billsRes.error }, { status: 503 });
  const select = { id: true, date: true, amountInr: true, partyId: true, partyName: true, item: true, itemLabel: true } as const;
  const buysRes = await safeDbCall<RegRow[]>(() => prisma.registerEntry.findMany({ where: { kind: "PURCHASE", paymentMode: "CREDIT" }, select }));
  if (!buysRes.ok) return NextResponse.json({ error: buysRes.error }, { status: 503 });
  const paysRes = await safeDbCall<RegRow[]>(() => prisma.registerEntry.findMany({ where: { kind: "PAYMENT", item: "supplier" }, select }));
  if (!paysRes.ok) return NextResponse.json({ error: paysRes.error }, { status: 503 });
  const partiesRes = await safeDbCall<{ id: string; name: string }[]>(() => prisma.party.findMany({ select: { id: true, name: true } }));
  if (!partiesRes.ok) return NextResponse.json({ error: partiesRes.error }, { status: 503 });

  const bills: PayBill[] = [
    ...billsRes.data.map((b) => ({ id: b.id, source: "bill" as const, ref: b.billNo, date: b.date, amountInr: b.totalInr, partyId: b.partyId, partyName: null })),
    ...buysRes.data.map((e) => ({ id: e.id, source: "register" as const, ref: e.itemLabel || e.item || "Purchase", date: e.date, amountInr: e.amountInr, partyId: e.partyId, partyName: e.partyName })),
  ];
  const payments: PayPayment[] = paysRes.data.map((e) => ({ id: e.id, date: e.date, amountInr: e.amountInr, partyId: e.partyId, partyName: e.partyName }));
  const today = businessDate(Date.now());
  return NextResponse.json({ data: payables(bills, payments, partiesRes.data, today), today });
}
