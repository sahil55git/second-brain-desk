// Oil cake (khali) sale log (lib/khaliSales.ts). Read-only and owner-only: the sales
// themselves are Quick Register entries (Sale → Oil cake).
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate } from "@/lib/registerServer";
import { khaliSummary, type KhaliEntry } from "@/lib/khaliSales";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!user.isOwner) return NextResponse.json({ error: "Only the owner can see the khali sales." }, { status: 403 });
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!isValidDate(from) || !isValidDate(to) || from > to) return NextResponse.json({ error: "from/to=YYYY-MM-DD are required" }, { status: 400 });
  const result = await safeDbCall<KhaliEntry[]>(() =>
    prisma.registerEntry.findMany({
      where: { kind: "SALE", item: "cake", date: { gte: from, lte: to } },
      select: { id: true, date: true, qty: true, unit: true, rateInr: true, amountInr: true, paymentMode: true, partyName: true, notes: true },
    })
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: khaliSummary(result.data) });
}
