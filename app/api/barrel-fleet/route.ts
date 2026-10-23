// Barrel fleet — the shop's own reusable barrels.
//   GET  list every barrel with its live flags, a summary and names used before (owner and staff)
//   POST register new barrels BRL-xx (owner only)
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { TABLE_HINT, missingTable } from "@/lib/attachmentServer";
import { FLEET_DEFAULTS, fleetSummary, nextFleetCodes, type FleetBarrelLike } from "@/lib/barrelFleet";
import { MAX_FLEET_REGISTER, logFleetEvent, shapeFleetBarrel } from "@/lib/barrelFleetServer";
import { posNum, str } from "@/lib/barrelServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const all = req.nextUrl.searchParams.get("all") === "1";
  const result = await safeDbCall(async () => {
    const barrels = await prisma.fleetBarrel.findMany({ where: all ? {} : { active: true }, orderBy: { code: "asc" } });
    const names = await prisma.fleetEvent.findMany({ where: { party: { not: null } }, orderBy: { at: "desc" }, take: 120, select: { party: true } });
    return { barrels, names };
  });
  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
  const now = Date.now();
  const shaped = result.data.barrels.map((b) => shapeFleetBarrel(b, now));
  const parties = Array.from(new Set(result.data.names.map((n) => n.party).filter((p): p is string => !!p))).slice(0, 40);
  return NextResponse.json({
    data: shaped,
    summary: fleetSummary(result.data.barrels as unknown as FleetBarrelLike[], now),
    parties,
    isOwner: user.isOwner,
    defaults: { capacityKg: FLEET_DEFAULTS.capacityKg, usualFillKg: FLEET_DEFAULTS.usualFillKg },
    serverNow: now,
  });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!user.isOwner) return NextResponse.json({ error: "Only the owner can register barrels." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const by = user.name || "owner";
  const count = Math.floor(Number(body.count ?? 1));
  if (!Number.isFinite(count) || count < 1 || count > MAX_FLEET_REGISTER) return NextResponse.json({ error: `Register between 1 and ${MAX_FLEET_REGISTER} barrels at a time.` }, { status: 400 });
  const capacityKg = body.capacityKg == null || body.capacityKg === "" ? FLEET_DEFAULTS.capacityKg : posNum(body.capacityKg);
  if (capacityKg == null || capacityKg > 500) return NextResponse.json({ error: "Capacity must be between 1 and 500 kg." }, { status: 400 });
  const startNo = body.startNo == null || body.startNo === "" ? undefined : Math.floor(Number(body.startNo));
  if (startNo != null && (!Number.isFinite(startNo) || startNo < 1 || startNo > 999)) return NextResponse.json({ error: "Start number must be 1 to 999." }, { status: 400 });
  const mark = count === 1 ? str(body.mark, 80) : null;

  const result = await safeDbCall(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const existing = await prisma.fleetBarrel.findMany({ select: { code: true } });
      const codes = nextFleetCodes(existing.map((e) => e.code), count, startNo); // numbers already used are skipped
      try {
        return await prisma.$transaction(async (tx) => {
          const made = [];
          for (const code of codes) {
            const b = await tx.fleetBarrel.create({ data: { code, mark, capacityKg, createdBy: by } });
            await logFleetEvent(tx, b, "REGISTER", by, { detail: { capacityKg, mark } });
            made.push(b);
          }
          return made;
        });
      } catch (e) {
        if ((e as { code?: string }).code === "P2002" && attempt < 2) continue; // someone registered at the same moment
        throw e;
      }
    }
    throw new Error("Could not allocate barrel codes");
  });
  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
  const now = Date.now();
  return NextResponse.json({ data: result.data.map((b) => shapeFleetBarrel(b, now)) }, { status: 201 });
}
