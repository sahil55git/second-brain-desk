// Widget keys for the Android app. POST (signed in) makes a key for this phone and returns it
// ONCE; GET lists keys (the owner sees all, staff their own); DELETE ?id= switches one off.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { cleanDeviceName, hashDeviceToken, newDeviceToken } from "@/lib/deviceToken";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const r = await safeDbCall(() =>
    prisma.deviceToken.findMany({ where: user.isOwner ? {} : { username: user.username }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, name: true, username: true, role: true, createdAt: true, lastUsedAt: true, revokedAt: true } }),
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: r.data });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const token = newDeviceToken();
  const r = await safeDbCall(() =>
    prisma.deviceToken.create({ data: { name: cleanDeviceName(body.name), hash: hashDeviceToken(token), username: user.username, role: user.isOwner ? "OWNER" : "STAFF" }, select: { id: true } }),
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: { id: r.data.id, token } });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") || "";
  const r = await safeDbCall(() =>
    prisma.deviceToken.updateMany({ where: { id, revokedAt: null, ...(user.isOwner ? {} : { username: user.username }) }, data: { revokedAt: new Date() } }),
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  if (!r.data.count) return NextResponse.json({ error: "Key not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
