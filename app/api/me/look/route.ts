// My look (theme, accent, background, appearance) — saved per login so every device shows
// the theme I picked last. GET → { data: { look, savedAt } | null }; PUT { look, savedAt }.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const r = await safeDbCall(() => prisma.userLook.findUnique({ where: { username: user.username } }));
  if (!r.ok) return NextResponse.json({ data: null });
  return NextResponse.json({ data: r.data ? { look: r.data.data, savedAt: Number(r.data.savedAt) } : null });
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const look = body.look;
  const savedAt = Number(body.savedAt);
  if (!look || typeof look !== "object" || !Number.isFinite(savedAt)) return NextResponse.json({ error: "Bad look." }, { status: 400 });
  const json = JSON.stringify(look);
  if (json.length > 20_000) return NextResponse.json({ error: "Too big." }, { status: 400 });
  const r = await safeDbCall(async () => {
    const cur = await prisma.userLook.findUnique({ where: { username: user.username }, select: { savedAt: true } });
    if (cur && Number(cur.savedAt) > savedAt) return false; // a newer pick from another device wins
    await prisma.userLook.upsert({
      where: { username: user.username },
      create: { username: user.username, data: JSON.parse(json), savedAt: BigInt(Math.round(savedAt)) },
      update: { data: JSON.parse(json), savedAt: BigInt(Math.round(savedAt)) },
    });
    return true;
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ ok: r.data });
}
