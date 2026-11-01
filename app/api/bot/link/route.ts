// Link codes and my linked chat accounts (any signed-in login, for itself).
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/registerServer";
import { prisma, safeDbCall } from "@/lib/db";
import { makeLinkCode } from "@/lib/bot/engine";
import { botKeys } from "@/lib/bot/config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const r = await safeDbCall(async () => {
    const keys = await botKeys();
    const links = await prisma.botLink.findMany({ where: { username: user.username, revokedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, channel: true, label: true, createdAt: true, lastUsedAt: true } });
    return { links, telegram: keys.telegramToken ? keys.telegramName || "on" : null, discord: !!(keys.discordAppId && keys.discordPublicKey), discordAppId: keys.discordAppId };
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: r.data });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const r = await safeDbCall(() => makeLinkCode(user.username));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: r.data });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") || "";
  const r = await safeDbCall(() => prisma.botLink.updateMany({ where: { id, ...(user.isOwner ? {} : { username: user.username }) }, data: { revokedAt: new Date() } }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ ok: r.data.count > 0 });
}
