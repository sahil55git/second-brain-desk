// One user (Owner only): change profile, switch on/off, reset password.
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { requireOwner } from "@/lib/ownerGuard";
import { loadProfiles } from "@/lib/accessServer";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const found = await safeDbCall(() => prisma.user.findUnique({ where: { id: params.id } }));
  if (!found.ok) return NextResponse.json({ error: found.error }, { status: 503 });
  if (!found.data) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const isOwner = found.data.role === "OWNER";
  const data: Prisma.UserUpdateInput = {};
  if (typeof body.active === "boolean") {
    if (isOwner && !body.active) return NextResponse.json({ error: "The owner cannot be switched off." }, { status: 400 });
    data.active = body.active;
  }
  if (typeof body.profileKey === "string") {
    if (isOwner) return NextResponse.json({ error: "The owner always has the Owner profile." }, { status: 400 });
    const profiles = await loadProfiles();
    if (body.profileKey === "owner" || !profiles.some((p) => p.id === body.profileKey)) return NextResponse.json({ error: "Pick one of the profiles." }, { status: 400 });
    data.profileKey = body.profileKey;
  }
  if (typeof body.password === "string" && body.password) {
    if (body.password.length < 6) return NextResponse.json({ error: "Password needs at least 6 characters." }, { status: 400 });
    data.passwordHash = await bcrypt.hash(body.password, 10);
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  const r = await safeDbCall(() => prisma.user.update({ where: { id: params.id }, data, select: { id: true, username: true, name: true, role: true, active: true, profileKey: true } }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: r.data });
}
