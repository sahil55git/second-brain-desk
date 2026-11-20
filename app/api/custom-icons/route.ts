// Uploaded icons. GET → { data: CustomIcon[] } (any signed-in user); POST { name, kn?, dataUrl } and
// DELETE ?id= are owner-only. Stored in AppSetting "custom_icons".
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { CUSTOM_KEY, MAX_CUSTOM, cleanCustomIcon, type CustomIcon } from "@/lib/customIcons";

export const dynamic = "force-dynamic";

async function read(): Promise<CustomIcon[]> {
  const r = await safeDbCall(() => prisma.appSetting.findUnique({ where: { key: CUSTOM_KEY } }));
  const d = r.ok ? (r.data?.data as unknown) : null;
  return Array.isArray(d) ? (d as CustomIcon[]) : [];
}
const write = (list: CustomIcon[], by: string) =>
  safeDbCall(() => prisma.appSetting.upsert({ where: { key: CUSTOM_KEY }, create: { key: CUSTOM_KEY, data: list as never, updatedBy: by }, update: { data: list as never, updatedBy: by } }));

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ data: await read() });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!user.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const list = await read();
  if (list.length >= MAX_CUSTOM) return NextResponse.json({ error: "Too many uploaded icons. Delete one first." }, { status: 400 });
  const c = cleanCustomIcon(await req.json().catch(() => ({})), list.map((x) => x.id));
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });
  const icon = { ...c.icon, by: user.username, at: new Date().toISOString() };
  const w = await write([...list, icon], user.username);
  if (!w.ok) return NextResponse.json({ error: w.error }, { status: 503 });
  return NextResponse.json({ data: icon });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!user.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") || "";
  const list = await read();
  if (!list.some((x) => x.id === id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const w = await write(list.filter((x) => x.id !== id), user.username);
  if (!w.ok) return NextResponse.json({ error: w.error }, { status: 503 });
  return NextResponse.json({ ok: true });
}
