// Save one weighing of a fleet barrel: FULL (gross) or EMPTY.
//
//  - Normal path: source "SCALE" + tickId. The kilograms are read from the
//    ScaleTick row the scale bridge posted; the browser cannot choose them.
//    A tick works once, within two minutes of settling.
//  - Fallback: source "MANUAL" + kg + a reason. Allowed (scales fail), but the
//    ledger row is marked MANUAL and the owner sees a flag.
//  - The FIRST empty weight becomes the barrel's tare. Changing a tare later
//    is owner-only and needs a reason (the old tare stays in the ledger).
//  - A full weight needs a tare; net oil = gross − tare.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { TABLE_HINT, missingTable } from "@/lib/attachmentServer";
import { checkWeighedAt, tickFresh, validKg } from "@/lib/barrels";
import { checkFleetWeigh, emptyOutcome, findFleetCode, grossOutcome, type FleetPhase } from "@/lib/barrelFleet";
import { logFleetEvent, shapeFleetBarrel } from "@/lib/barrelFleetServer";
import { str } from "@/lib/barrelServer";

export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => ({ error, status }) as const;

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const by = user.name || "staff";

  const parsed = findFleetCode(String(body.code ?? ""));
  if (!parsed) return NextResponse.json({ error: "That is not one of our barrel labels. Scan the barcode on the barrel (BRL-01 …)." }, { status: 400 });
  const phase: FleetPhase | null = body.phase === "GROSS" || body.phase === "EMPTY" ? body.phase : null;
  if (!phase) return NextResponse.json({ error: "Say whether this is the full or the empty weight." }, { status: 400 });
  const source = body.source === "MANUAL" ? "MANUAL" : "SCALE";
  const note = str(body.note, 300);
  const setTare = body.setTare === true;
  const product = phase === "GROSS" ? str(body.product, 40) : null;
  if (source === "MANUAL" && (!note || note.length < 3)) return NextResponse.json({ error: "Typing a weight by hand needs a reason (for example: scale not working)." }, { status: 400 });
  if (phase === "GROSS" && !product) return NextResponse.json({ error: "Choose which oil is in the barrel." }, { status: 400 });

  const result = await safeDbCall(async () => {
    const barrel = await prisma.fleetBarrel.findUnique({ where: { code: parsed.code } });
    if (!barrel) return fail(`${parsed.code} is not registered. Ask the owner to register it.`, 404);

    let kg: number;
    let weighedAt = new Date();
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
      weighedAt = tick.settledAt;
    } else {
      kg = Number(body.kg);
      if (!validKg(kg)) return fail("Type a weight in kg.", 400);
      const t = checkWeighedAt(body.weighedAt, Date.now());
      if ("error" in t) return fail(t.error, 400);
      weighedAt = t.at;
    }

    const problem = checkFleetWeigh(phase, kg, barrel);
    if (problem) return fail(problem, 400);
    if (phase === "EMPTY" && setTare && barrel.tareKg != null) {
      if (!user.isOwner) return fail("Only the owner can change a barrel's tare.", 403);
      if (!note || note.length < 3) return fail("Give a reason for changing the tare (for example: new dent, repaired).", 400);
    }
    if (phase === "EMPTY" && barrel.status === "FULL" && barrel.grossAt && weighedAt.getTime() < new Date(barrel.grossAt).getTime())
      return fail("The empty weighing cannot be dated before the full weighing.", 400);

    if (tickId) {
      const claimed = await prisma.scaleTick.updateMany({
        where: { id: tickId, usedAt: null },
        data: { usedAt: new Date(), usedBarrelCode: barrel.code, usedPhase: phase },
      });
      if (claimed.count !== 1) return fail("That scale reading was just used. Wait for the next steady reading.", 409);
    }

    let data: Record<string, unknown>;
    let ev: Parameters<typeof logFleetEvent>[4];
    let netKg: number | null;
    if (phase === "GROSS") {
      const out = grossOutcome(barrel, kg);
      netKg = out.netKg;
      data = { status: "FULL", product, grossKg: kg, grossAt: weighedAt, netKg: out.netKg, lastGrossDiffKg: out.diffKg };
      ev = {
        at: weighedAt, source, scale: scaleSource, tickId, kg, tareKg: out.tareKg, netKg: out.netKg, product, note,
        detail: { prevGrossKg: out.prevGrossKg, diffKg: out.diffKg, allowedKg: out.allowedKg, overCapacity: out.overCapacity },
      };
    } else {
      const out = emptyOutcome(barrel, kg, setTare);
      netKg = out.pouredKg;
      data = {
        status: "EMPTY", product: null, netKg: null, lastGrossDiffKg: null, lastEmptyKg: kg, lastEmptyAt: weighedAt,
        ...(out.setsTare ? { tareKg: kg, tareAt: weighedAt, tareBy: by } : {}),
      };
      ev = {
        at: weighedAt, source, scale: scaleSource, tickId, kg, tareKg: out.setsTare ? kg : barrel.tareKg, netKg: out.pouredKg, product: barrel.product, note,
        detail: { setsTare: out.setsTare, previousTareKg: out.setsTare ? barrel.tareKg : null, driftKg: out.driftKg, pouredKg: out.pouredKg },
      };
    }
    const saved = await prisma.$transaction(async (tx) => {
      const b = await tx.fleetBarrel.update({ where: { id: barrel.id }, data });
      const event = await logFleetEvent(tx, barrel, phase, by, ev);
      return { b, event };
    });
    return { b: saved.b, eventId: saved.event.id, kg, netKg, setsTare: phase === "EMPTY" && !!(ev?.detail as { setsTare?: boolean }).setsTare } as const;
  });

  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
  const d = result.data;
  if ("error" in d) return NextResponse.json({ error: d.error }, { status: d.status });
  return NextResponse.json({ data: shapeFleetBarrel(d.b), eventId: d.eventId, kg: d.kg, net: d.netKg, setsTare: d.setsTare });
}
