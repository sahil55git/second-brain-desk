// Shared settings by key: GET ?key=… (owner; "shop" and "rates" for every signed-in user, so bills
// can show the UPI QR and card rates), PUT { key, data } (owner).
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";

export const dynamic = "force-dynamic";
const KEYS = ["profit", "shop", "rates", "budgets", "cashplan"];
const READ_ANY = ["shop", "rates"];

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  const key = req.nextUrl.searchParams.get("key") || "";
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!user.isOwner && !READ_ANY.includes(key)) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  if (!KEYS.includes(key)) return NextResponse.json({ error: "Unknown setting." }, { status: 400 });
  const r = await safeDbCall(() => prisma.appSetting.findUnique({ where: { key } }));
  return NextResponse.json({ data: r.ok ? r.data?.data ?? null : null });
}

export async function PUT(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const key = String(body.key || "");
  if (!KEYS.includes(key) || !body.data || typeof body.data !== "object") return NextResponse.json({ error: "Bad setting." }, { status: 400 });
  const json = JSON.stringify(body.data);
  if (json.length > 60_000) return NextResponse.json({ error: "Too big." }, { status: 400 });
  const data = JSON.parse(json);
  const r = await safeDbCall(() => prisma.appSetting.upsert({ where: { key }, create: { key, data, updatedBy: user.username }, update: { data, updatedBy: user.username } }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ ok: true });
}
