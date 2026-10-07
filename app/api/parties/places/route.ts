// Add the Bidar-area places (lib/bidarPlaces.ts) as customer accounts so they
// appear in the register's name pickers, job-work and the Parties ledger.
// Existing names are never duplicated or changed. Owner only.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { PLACES, newPlaces, placeAddress, type PlaceGroup } from "@/lib/bidarPlaces";

export const dynamic = "force-dynamic";
const GROUPS: PlaceGroup[] = ["city", "village", "town"];

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const result = await safeDbCall(() => prisma.party.findMany({ select: { name: true } }));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  const names = result.data.map((p) => p.name);
  return NextResponse.json({
    data: {
      total: PLACES.length,
      fresh: Object.fromEntries(GROUPS.map((g) => [g, newPlaces([g], names).length])),
      all: Object.fromEntries(GROUPS.map((g) => [g, PLACES.filter((p) => p.group === g).length])),
    },
  });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!user.isOwner) return NextResponse.json({ error: "Only the owner can add places." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const groups = (Array.isArray(body.groups) ? body.groups : []).filter((g: unknown): g is PlaceGroup => GROUPS.includes(g as PlaceGroup));
  if (!groups.length) return NextResponse.json({ error: "Choose at least one group." }, { status: 400 });

  const result = await safeDbCall(async () => {
    const existing = await prisma.party.findMany({ select: { name: true } });
    const add = newPlaces(groups, existing.map((p) => p.name));
    if (add.length) {
      await prisma.party.createMany({
        data: add.map((p) => ({ type: "CUSTOMER" as const, name: p.name, address: placeAddress(p), state: "Karnataka", notes: "Place account (Bidar area) — added in one go" })),
      });
    }
    return { added: add.length, skipped: groups.reduce((a: number, g: PlaceGroup) => a + PLACES.filter((p) => p.group === g).length, 0) - add.length };
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data }, { status: 201 });
}
