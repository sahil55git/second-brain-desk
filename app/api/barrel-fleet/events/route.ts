// The fleet ledger: every weighing and movement, newest first.
//   ?id=EVENT            one row with its barrel (for the slip)
//   ?code=BRL-07 &party=text &action=GROSS|EMPTY|MOVE|EDIT|REGISTER &from=YYYY-MM-DD &to=YYYY-MM-DD &limit=500
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, dayRange, isValidDate } from "@/lib/registerServer";
import { TABLE_HINT, missingTable } from "@/lib/attachmentServer";
import { findFleetCode } from "@/lib/barrelFleet";
import { shapeFleetBarrel } from "@/lib/barrelFleetServer";

export const dynamic = "force-dynamic";

const ACTIONS = ["REGISTER", "GROSS", "EMPTY", "MOVE", "EDIT"];

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const id = q.get("id");

  if (id) {
    const result = await safeDbCall(async () => {
      const event = await prisma.fleetEvent.findUnique({ where: { id } });
      if (!event) return null;
      const barrel = await prisma.fleetBarrel.findUnique({ where: { id: event.barrelId } });
      return { event, barrel };
    });
    if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
    if (!result.data) return NextResponse.json({ error: "No such ledger entry." }, { status: 404 });
    return NextResponse.json({ data: result.data.event, barrel: result.data.barrel ? shapeFleetBarrel(result.data.barrel) : null });
  }

  const where: Record<string, unknown> = {};
  const rawCode = q.get("code");
  if (rawCode) {
    const c = findFleetCode(rawCode);
    if (!c) return NextResponse.json({ error: "That is not one of our barrel labels." }, { status: 400 });
    where.barrelCode = c.code;
  }
  const party = q.get("party")?.trim();
  if (party) where.party = { contains: party.slice(0, 80), mode: "insensitive" };
  const action = q.get("action");
  if (action) {
    if (!ACTIONS.includes(action)) return NextResponse.json({ error: "Unknown action filter." }, { status: 400 });
    where.action = action;
  }
  const from = q.get("from");
  const to = q.get("to");
  if ((from && !isValidDate(from)) || (to && !isValidDate(to))) return NextResponse.json({ error: "Dates must look like 2026-10-23." }, { status: 400 });
  if (from || to) where.at = { ...(from ? { gte: dayRange(from).start } : {}), ...(to ? { lt: dayRange(to).end } : {}) };
  const limit = Math.min(1000, Math.max(1, Math.floor(Number(q.get("limit") ?? 500)) || 500));

  const result = await safeDbCall(() => prisma.fleetEvent.findMany({ where, orderBy: { at: "desc" }, take: limit }));
  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
  return NextResponse.json({ data: result.data, isOwner: user.isOwner, truncated: result.data.length === limit });
}
