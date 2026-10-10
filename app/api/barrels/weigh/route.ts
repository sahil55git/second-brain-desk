// Save one weighment of one barrel (full or empty).
//
//  - Normal path: source "SCALE" + tickId. The kilograms are read from the
//    ScaleTick row the scale bridge posted — the browser cannot choose them.
//    A tick works once, within two minutes of settling.
//  - Fallback: source "MANUAL" + kg + a reason. Allowed (scales fail), but the
//    barrel is marked MANUAL and the owner sees a flag.
//  - Weighing a barrel again (reweigh) is owner-only and needs a reason; the
//    old figure is kept in the audit trail.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { TABLE_HINT, missingTable } from "@/lib/attachmentServer";
import { checkWeigh, parseBarrelCode, tickFresh, validKg, type Phase } from "@/lib/barrels";
import { RECEIPT_INCLUDE, logEvent, shapeReceipt, str } from "@/lib/barrelServer";

export const dynamic = "force-dynamic";

function fail(error: string, status: number) {
  return { error, status } as const;
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const by = user.name || "staff";

  const parsed = parseBarrelCode(String(body.code ?? ""));
  if (!parsed) return NextResponse.json({ error: "That is not a barrel label. Scan the barcode on the barrel." }, { status: 400 });
  const phase: Phase | null = body.phase === "GROSS" || body.phase === "EMPTY" ? body.phase : null;
  if (!phase) return NextResponse.json({ error: "Say whether this is the full or the empty weight." }, { status: 400 });
  const source = body.source === "MANUAL" ? "MANUAL" : "SCALE";
  const reweigh = body.reweigh === true;
  const note = str(body.note, 300);
  if (reweigh && !user.isOwner) return NextResponse.json({ error: "Only the owner can weigh a barrel again." }, { status: 403 });
  if (reweigh && (!note || note.length < 3)) return NextResponse.json({ error: "Give a reason for weighing again." }, { status: 400 });
  if (source === "MANUAL" && (!note || note.length < 3)) return NextResponse.json({ error: "Typing a weight by hand needs a reason (for example: scale not working)." }, { status: 400 });

  const result = await safeDbCall(async () => {
    const barrel = await prisma.barrel.findUnique({ where: { code: parsed.code }, include: { receipt: true } });
    if (!barrel) return fail("This barrel label is not in the system. Check the lot number.", 404);
    if (barrel.receipt.status !== "OPEN") return fail("This lot is closed.", 409);

    let kg: number;
    let scaleSource: string | null = null;
    let tickId: string | null = null;
    if (source === "SCALE") {
      tickId = typeof body.tickId === "string" ? body.tickId : null;
      const tick = tickId ? await prisma.scaleTick.findUnique({ where: { id: tickId } }) : null;
      if (!tick) return fail("No scale reading to use. Put the barrel on the scale, wait for the steady light, then capture.", 400);
      if (tick.usedAt) return fail("That scale reading was already used for another barrel. Wait for the next steady reading.", 409);
      if (!tickFresh(tick.settledAt.getTime(), Date.now())) return fail("That scale reading is too old. Capture again.", 409);
      kg = tick.weightKg;
      scaleSource = tick.source;
    } else {
      kg = Number(body.kg);
      if (!validKg(kg)) return fail("Type a weight in kg.", 400);
    }

    const problem = checkWeigh(phase, kg, barrel, { reweigh });
    if (problem) return fail(problem, 400);

    if (tickId) {
      const claimed = await prisma.scaleTick.updateMany({
        where: { id: tickId, usedAt: null },
        data: { usedAt: new Date(), usedBarrelCode: barrel.code, usedPhase: phase },
      });
      if (claimed.count !== 1) return fail("That scale reading was just used. Wait for the next steady reading.", 409);
    }

    const now = new Date();
    const data =
      phase === "GROSS"
        ? { grossKg: kg, grossAt: now, grossBy: by, grossSource: source, grossScale: scaleSource, grossTickId: tickId, grossNote: note }
        : { emptyKg: kg, emptyAt: now, emptyBy: by, emptySource: source, emptyScale: scaleSource, emptyTickId: tickId, emptyNote: note };
    const before = phase === "GROSS" ? barrel.grossKg : barrel.emptyKg;
    await prisma.$transaction(async (tx) => {
      await tx.barrel.update({ where: { id: barrel.id }, data });
      await logEvent(tx, barrel.receiptId, reweigh ? "REWEIGH" : phase, by, { phase, kg, source, scale: scaleSource, tickId, note, ...(reweigh ? { previousKg: before } : {}) }, barrel.code);
    });
    const r = await prisma.oilReceipt.findUnique({ where: { id: barrel.receiptId }, include: RECEIPT_INCLUDE });
    return { r: r!, code: barrel.code, kg } as const;
  });

  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
  const d = result.data;
  if ("error" in d) return NextResponse.json({ error: d.error }, { status: d.status });
  const receipt = shapeReceipt(d.r, user.isOwner);
  return NextResponse.json({ data: receipt, barrel: receipt.barrels.find((b) => b.code === d.code), kg: d.kg });
}
