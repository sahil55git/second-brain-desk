// Move a fleet barrel: send it out (customer, supplier, vehicle, repair) or bring it back to the shop.
// The barrel's current oil and weights are copied into the ledger row, so a delivery slip shows exactly
// what left the shop.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { TABLE_HINT, missingTable } from "@/lib/attachmentServer";
import { PURPOSES, checkMove, findFleetCode, type Purpose } from "@/lib/barrelFleet";
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
  if (!parsed) return NextResponse.json({ error: "That is not one of our barrel labels." }, { status: 400 });
  const to = typeof body.to === "string" ? body.to : "";
  const holder = str(body.holder, 80);
  const vehicleNo = str(body.vehicleNo, 20)?.toUpperCase() ?? null;
  const ref = str(body.ref, 40);
  const note = str(body.note, 300);
  const purpose: Purpose | null = (PURPOSES as readonly string[]).includes(body.purpose) ? body.purpose : null;

  const result = await safeDbCall(async () => {
    const barrel = await prisma.fleetBarrel.findUnique({ where: { code: parsed.code } });
    if (!barrel) return fail(`${parsed.code} is not registered.`, 404);
    const problem = checkMove(barrel, to, to === "SHOP" ? holder ?? "back" : holder);
    if (problem) return fail(problem, 400);
    if (to !== "SHOP" && barrel.condition === "LEAKING" && barrel.status === "FULL") return fail(`${barrel.code} is marked LEAKING and has oil in it. Sort that out before it goes out.`, 400);

    const now = new Date();
    const full = barrel.status === "FULL";
    const fromLoc = barrel.location; // read before the update below changes the row
    const prevHolder = barrel.holder;
    const saved = await prisma.$transaction(async (tx) => {
      const b = await tx.fleetBarrel.update({
        where: { id: barrel.id },
        data: { location: to, holder: to === "SHOP" ? null : holder, sinceAt: now },
      });
      const event = await logFleetEvent(tx, barrel, "MOVE", by, {
        at: now,
        fromLoc,
        toLoc: to,
        party: to === "SHOP" ? holder ?? prevHolder : holder,
        vehicleNo,
        purpose,
        ref,
        note,
        // what was inside when it moved: copied from the last full weighing
        kg: full ? barrel.grossKg : null,
        tareKg: barrel.tareKg,
        netKg: full ? barrel.netKg : null,
        product: full ? barrel.product : null,
        detail: { barrelStatus: barrel.status, lastGrossAt: full && barrel.grossAt ? barrel.grossAt.toISOString() : null },
      });
      return { b, event };
    });
    return { b: saved.b, eventId: saved.event.id } as const;
  });

  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
  const d = result.data;
  if ("error" in d) return NextResponse.json({ error: d.error }, { status: d.status });
  return NextResponse.json({ data: shapeFleetBarrel(d.b), eventId: d.eventId });
}
