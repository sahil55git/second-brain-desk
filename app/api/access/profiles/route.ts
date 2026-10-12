// Access profiles (Owner only): list them all, make a new one as a copy of another.
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { requireOwner } from "@/lib/ownerGuard";
import { loadProfiles } from "@/lib/accessServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ data: await loadProfiles() });
}

export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const profiles = await loadProfiles();
  const from = profiles.find((p) => p.id === body.copyFrom) || profiles.find((p) => p.id === "counter")!;
  const name = String(body.name || "").trim().slice(0, 40) || `Custom ${profiles.length - 3}`;
  const id = "p_" + Math.random().toString(36).slice(2, 9);
  const perms = from.id === "owner" ? { ...from.perms, hide: { ...from.perms.hide, totals: true } } : from.perms;
  const r = await safeDbCall(() => prisma.accessProfile.create({ data: { id, name, who: `copy of ${from.name}`, perms: perms as unknown as Prisma.InputJsonValue } }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: { id, name, who: `copy of ${from.name}`, perms: perms as unknown as Prisma.InputJsonValue } }, { status: 201 });
}
