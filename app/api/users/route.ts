// Users (Owner only): list them and add a new login with an access profile.
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma, safeDbCall } from "@/lib/db";
import { requireOwner } from "@/lib/ownerGuard";
import { loadProfiles } from "@/lib/accessServer";
import { LEGACY_STAFF_PROFILE } from "@/lib/access";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const r = await safeDbCall(() => prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, username: true, name: true, role: true, active: true, profileKey: true } }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: r.data });
}

export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim().slice(0, 60);
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  const profileKey = String(body.profileKey || LEGACY_STAFF_PROFILE);
  if (!name) return NextResponse.json({ error: "Type the person's name." }, { status: 400 });
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return NextResponse.json({ error: "Login name: 3–30 letters or numbers (no spaces)." }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "Password needs at least 6 characters." }, { status: 400 });
  const profiles = await loadProfiles();
  if (profileKey === "owner" || !profiles.some((p) => p.id === profileKey)) return NextResponse.json({ error: "Pick one of the profiles." }, { status: 400 });
  const exists = await safeDbCall(() => prisma.user.findUnique({ where: { username } }));
  if (!exists.ok) return NextResponse.json({ error: exists.error }, { status: 503 });
  if (exists.data) return NextResponse.json({ error: "That login name is taken." }, { status: 409 });
  const passwordHash = await bcrypt.hash(password, 10);
  const r = await safeDbCall(() => prisma.user.create({ data: { username, name, passwordHash, role: "STAFF", active: true, profileKey }, select: { id: true, username: true, name: true, role: true, active: true, profileKey: true } }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: r.data }, { status: 201 });
}
