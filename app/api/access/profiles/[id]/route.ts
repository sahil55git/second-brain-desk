// One profile (Owner only): rename it or change what it can see / use / open. The owner profile is fixed.
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { requireOwner } from "@/lib/ownerGuard";
import { loadProfiles } from "@/lib/accessServer";
import { BUILTIN_IDS, normalizePerms } from "@/lib/access";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (params.id === "owner") return NextResponse.json({ error: "The Owner profile always sees everything." }, { status: 400 });
  const profiles = await loadProfiles();
  const cur = profiles.find((p) => p.id === params.id);
  if (!cur) return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 40) : cur.name;
  const perms = body.perms ? normalizePerms(body.perms, cur.perms) : cur.perms;
  const json = perms as unknown as Prisma.InputJsonValue;
  const r = await safeDbCall(() =>
    prisma.accessProfile.upsert({ where: { id: params.id }, update: { name, perms: json }, create: { id: params.id, name, who: cur.who, perms: json } })
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: { id: params.id, name, who: cur.who, perms } });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (BUILTIN_IDS.includes(params.id)) return NextResponse.json({ error: "The four built-in profiles cannot be deleted." }, { status: 400 });
  const used = await safeDbCall(() => prisma.user.count({ where: { profileKey: params.id } }));
  if (!used.ok) return NextResponse.json({ error: used.error }, { status: 503 });
  if (used.data > 0) return NextResponse.json({ error: "Some users still have this profile. Move them to another profile first." }, { status: 409 });
  const r = await safeDbCall(() => prisma.accessProfile.delete({ where: { id: params.id } }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: { id: params.id } });
}
