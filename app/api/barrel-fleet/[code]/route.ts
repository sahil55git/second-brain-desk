// One fleet barrel.
//   GET   the barrel and its ledger (newest first)
//   PATCH change its mark, notes, condition, capacity, or retire it.
//         Staff can report a problem (DENTED / LEAKING) and add notes; only the owner can mark a barrel OK
//         again, change capacity or the mark, or retire / bring back a barrel.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { TABLE_HINT, missingTable } from "@/lib/attachmentServer";
import { CONDITIONS, findFleetCode, type Condition } from "@/lib/barrelFleet";
import { logFleetEvent, shapeFleetBarrel } from "@/lib/barrelFleetServer";
import { posNum, str } from "@/lib/barrelServer";

export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => ({ error, status }) as const;

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const parsed = findFleetCode(decodeURIComponent(params.code));
  if (!parsed) return NextResponse.json({ error: "That is not one of our barrel labels." }, { status: 400 });
  const result = await safeDbCall(async () => {
    const barrel = await prisma.fleetBarrel.findUnique({ where: { code: parsed.code } });
    if (!barrel) return null;
    const events = await prisma.fleetEvent.findMany({ where: { barrelId: barrel.id }, orderBy: { at: "desc" }, take: 200 });
    return { barrel, events };
  });
  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
  if (!result.data) return NextResponse.json({ error: `${parsed.code} is not registered.` }, { status: 404 });
  return NextResponse.json({ data: shapeFleetBarrel(result.data.barrel), events: result.data.events, isOwner: user.isOwner });
}

export async function PATCH(req: NextRequest, { params }: { params: { code: string } }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const parsed = findFleetCode(decodeURIComponent(params.code));
  if (!parsed) return NextResponse.json({ error: "That is not one of our barrel labels." }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const by = user.name || "staff";
  const note = str(body.note, 300);

  const result = await safeDbCall(async () => {
    const barrel = await prisma.fleetBarrel.findUnique({ where: { code: parsed.code } });
    if (!barrel) return fail(`${parsed.code} is not registered.`, 404);

    const data: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    const set = (k: string, v: unknown) => {
      const cur = (barrel as unknown as Record<string, unknown>)[k];
      if (cur !== v) {
        before[k] = cur;
        data[k] = v;
      }
    };

    if ("notes" in body) set("notes", str(body.notes, 300));
    if ("condition" in body) {
      const c = body.condition as Condition;
      if (!(CONDITIONS as readonly string[]).includes(c)) return fail("Condition must be OK, DENTED, LEAKING or RETIRED.", 400);
      const worse = c === "DENTED" || c === "LEAKING";
      if (!user.isOwner && !worse) return fail("Staff can report a dent or a leak. Only the owner can mark a barrel OK again or retire it.", 403);
      set("condition", c);
      if (c === "RETIRED") set("active", false);
      else if (!barrel.active) set("active", true);
    }
    if ("mark" in body) {
      if (!user.isOwner) return fail("Only the owner can change the barrel's mark.", 403);
      set("mark", str(body.mark, 80));
    }
    if ("capacityKg" in body) {
      if (!user.isOwner) return fail("Only the owner can change the capacity.", 403);
      const c = posNum(body.capacityKg);
      if (c == null || c > 500) return fail("Capacity must be between 1 and 500 kg.", 400);
      set("capacityKg", c);
    }
    if ("active" in body) {
      if (!user.isOwner) return fail("Only the owner can retire or bring back a barrel.", 403);
      const a = body.active === true;
      set("active", a);
      if (!a) set("condition", "RETIRED");
      else if (barrel.condition === "RETIRED") set("condition", "OK");
    }
    if (!Object.keys(data).length) return fail("Nothing to change.", 400);
    if (("condition" in body || "active" in body) && (!note || note.length < 3) && user.isOwner && (data.condition === "OK" || data.condition === "RETIRED" || data.active != null))
      return fail("Write a short reason (for example: repaired, scrapped, found again).", 400);

    const saved = await prisma.$transaction(async (tx) => {
      const b = await tx.fleetBarrel.update({ where: { id: barrel.id }, data });
      await logFleetEvent(tx, barrel, "EDIT", by, { note, detail: { before, after: data } });
      return b;
    });
    return { b: saved } as const;
  });

  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
  const d = result.data;
  if ("error" in d) return NextResponse.json({ error: d.error }, { status: d.status });
  return NextResponse.json({ data: shapeFleetBarrel(d.b) });
}
