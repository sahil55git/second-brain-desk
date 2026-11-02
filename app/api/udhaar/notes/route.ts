// Udhaar follow-up notes (owner): reminders sent and promised payment dates.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate } from "@/lib/registerServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const r = await safeDbCall(() => prisma.udhaarNote.findMany({ orderBy: { at: "desc" }, take: 1000 }));
  if (!r.ok) return NextResponse.json({ data: [] });
  return NextResponse.json({ data: r.data.map((n) => ({ ...n, at: n.at.toISOString() })) });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
  const kind = b.kind === "PROMISE" ? "PROMISE" : b.kind === "REMIND" ? "REMIND" : "";
  if (!name || !kind || !isValidDate(b.date)) return NextResponse.json({ error: "Name, kind and date are needed." }, { status: 400 });
  const amount = Number(b.amount);
  const r = await safeDbCall(() =>
    prisma.udhaarNote.create({ data: { name, kind, date: b.date, amount: Number.isFinite(amount) && amount > 0 ? amount : null, note: typeof b.note === "string" ? b.note.slice(0, 300) : null, by: user.username } })
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: { ...r.data, at: r.data.at.toISOString() } });
}
