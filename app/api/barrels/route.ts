// Barrel receiving — list lots (GET) and start a new lot (POST).
// Everyone signed in can receive. Staff do "blind" receiving: they never see
// the supplier's declared quantity, the rate, or the shortage (lib/barrels.ts → staffView).
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { TABLE_HINT, missingTable } from "@/lib/attachmentServer";
import { MAX_BARRELS_PER_LOT, RECEIPT_INCLUDE, createReceipt, posNum, shapeReceipt, str } from "@/lib/barrelServer";

export const dynamic = "force-dynamic";

function dbError(err: string) {
  return NextResponse.json({ error: missingTable(err) ? TABLE_HINT : err }, { status: 503 });
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const today = businessDate(Date.now());
  const from = sp.get("from");
  const to = sp.get("to");
  const wantAll = sp.get("status") === "all";

  const result = await safeDbCall(async () => {
    // Open lots always show (they still need work); history only to the owner.
    const open = await prisma.oilReceipt.findMany({ where: { status: "OPEN" }, include: RECEIPT_INCLUDE, orderBy: { createdAt: "desc" }, take: 100 });
    let closed: typeof open = [];
    if (user.isOwner && wantAll) {
      const range = isValidDate(from) && isValidDate(to) ? { gte: from, lte: to } : undefined;
      closed = await prisma.oilReceipt.findMany({
        where: { status: "CLOSED", ...(range ? { date: range } : {}) },
        include: RECEIPT_INCLUDE,
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    }
    return [...open, ...closed];
  });
  if (!result.ok) return dbError(result.error);
  const now = Date.now();
  let data = result.data.map((r) => shapeReceipt(r, user.isOwner, now));
  if (!user.isOwner) {
    // Staff: lots still to be weighed, or any lot from today.
    data = data.filter((r) => r.summary.state !== "RECONCILED" || r.date === today);
  }
  return NextResponse.json({ data, isOwner: user.isOwner });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  const today = businessDate(Date.now());
  const date = isValidDate(body.date) ? body.date : today;
  if (!user.isOwner && date !== today) return NextResponse.json({ error: "Only the owner can start a lot for another day." }, { status: 403 });

  const supplierName = str(body.supplierName, 120);
  const product = str(body.product, 80);
  if (!supplierName) return NextResponse.json({ error: "Supplier name is required." }, { status: 400 });
  if (!product) return NextResponse.json({ error: "Which oil is it?" }, { status: 400 });

  const declaredBarrels = posNum(body.declaredBarrels);
  const barrelCount = Math.round(posNum(body.barrelCount) ?? declaredBarrels ?? 0);
  if (!barrelCount || barrelCount < 1 || barrelCount > MAX_BARRELS_PER_LOT)
    return NextResponse.json({ error: `Number of barrels must be 1 to ${MAX_BARRELS_PER_LOT}.` }, { status: 400 });

  const result = await safeDbCall(async () => {
    let partyId: string | null = str(body.partyId, 40);
    if (partyId && !(await prisma.party.findUnique({ where: { id: partyId }, select: { id: true } }))) partyId = null;
    return createReceipt({
      date,
      by: user.name || "staff",
      supplierName,
      partyId,
      product,
      vehicleNo: str(body.vehicleNo, 20)?.toUpperCase() ?? null,
      challanNo: str(body.challanNo, 60),
      rateInrPerKg: user.isOwner ? posNum(body.rateInrPerKg) : null, // only the owner sets rates
      declaredNetKg: posNum(body.declaredNetKg),
      declaredBarrels: declaredBarrels ? Math.round(declaredBarrels) : null,
      tankTarget: str(body.tankTarget, 40),
      notes: str(body.notes, 500),
      barrelCount,
    });
  });
  if (!result.ok) return dbError(result.error);
  return NextResponse.json({ data: shapeReceipt(result.data, user.isOwner) }, { status: 201 });
}
