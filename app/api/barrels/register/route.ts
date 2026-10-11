// Barrel register: one row per barrel across ALL lots — full weight, empty weight,
// net oil, and the date/time of each. Barrels can be emptied days after arrival, so
// this is where "what is still waiting?" and "what did barrel X weigh?" get answered.
//
//   GET /api/barrels/register?status=all|waiting|done|new&q=text&from=YYYY-MM-DD&to=YYYY-MM-DD&code=R261010-1-03
//
// Staff get blind rows (no supplier figures, rates or shortage); the owner also gets
// each barrel's history when asking for one code.
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate } from "@/lib/registerServer";
import { TABLE_HINT, missingTable } from "@/lib/attachmentServer";
import { findBarrelCode, registerRows, registerTotals, type RegisterRow } from "@/lib/barrels";
import { RECEIPT_INCLUDE, shapeReceipt, type ReceiptWithBarrels } from "@/lib/barrelServer";
import type { ShapedReceipt } from "@/lib/barrels";

export const dynamic = "force-dynamic";

type Status = "all" | "waiting" | "done" | "new";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const status: Status = (["waiting", "done", "new"] as const).find((s) => s === sp.get("status")) ?? "all";
  const q = (sp.get("q") || "").trim().slice(0, 60);
  const from = sp.get("from");
  const to = sp.get("to");
  const codeParam = sp.get("code");
  const one = codeParam ? findBarrelCode(codeParam) : null;
  if (codeParam && !one) return NextResponse.json({ error: "That is not a barrel label." }, { status: 400 });

  const where: Prisma.OilReceiptWhereInput = {};
  if (one) where.barrels = { some: { code: one.code } };
  else {
    if (isValidDate(from) && isValidDate(to)) where.date = { gte: from, lte: to };
    if (status === "waiting") where.barrels = { some: { grossKg: { not: null }, emptyKg: null } };
    else if (status === "done") where.barrels = { some: { emptyKg: { not: null } } };
    else if (status === "new") where.barrels = { some: { grossKg: null } };
    if (q) {
      where.OR = [
        { lotNo: { contains: q, mode: "insensitive" } },
        { supplierName: { contains: q, mode: "insensitive" } },
        { vehicleNo: { contains: q, mode: "insensitive" } },
        { challanNo: { contains: q, mode: "insensitive" } },
        { barrels: { some: { code: { contains: q, mode: "insensitive" } } } },
      ];
    }
  }

  const result = await safeDbCall(async () => {
    const lots: ReceiptWithBarrels[] = await prisma.oilReceipt.findMany({ where, include: RECEIPT_INCLUDE, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 300 });
    const events = one && user.isOwner ? await prisma.barrelEvent.findMany({ where: { barrelCode: one.code }, orderBy: { at: "desc" }, take: 100 }) : [];
    return { lots, events };
  });
  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });

  const now = Date.now();
  const shaped = result.data.lots.map((l) => shapeReceipt(l, user.isOwner, now) as unknown as ShapedReceipt);
  let rows: RegisterRow[] = registerRows(shaped, now);
  if (one) rows = rows.filter((r) => r.code === one.code);
  else {
    if (status === "waiting") rows = rows.filter((r) => r.state === "FULL");
    else if (status === "done") rows = rows.filter((r) => r.state === "DONE");
    else if (status === "new") rows = rows.filter((r) => r.state === "NEW");
    if (q) {
      const t = q.toLowerCase();
      rows = rows.filter((r) => [r.code, r.lotNo, r.supplierName, r.vehicleNo, r.challanNo, r.product].some((v) => (v ?? "").toLowerCase().includes(t)));
    }
  }
  // Waiting barrels: oldest first (those need attention). Everything else: newest first.
  rows.sort((a, b) => (status === "waiting" ? (b.waitingDays ?? 0) - (a.waitingDays ?? 0) : 0));
  return NextResponse.json({ data: rows, totals: registerTotals(rows), isOwner: user.isOwner, events: result.data.events, now });
}
