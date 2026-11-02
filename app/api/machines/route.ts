// Machine log (any signed-in user adds; owner sees the report). GET ?from= → logs;
// POST { date, machine, kind: run|stop|service, hours?, powerUnits?, downtimeMin?, note? }; DELETE ?id= (owner).
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate } from "@/lib/registerServer";

export const dynamic = "force-dynamic";
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; };

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const from = req.nextUrl.searchParams.get("from");
  const r = await safeDbCall(() => prisma.machineLog.findMany({ where: isValidDate(from) ? { OR: [{ date: { gte: from! } }, { kind: "service" }] } : {}, orderBy: { date: "desc" }, take: 2000 }));
  if (!r.ok) return NextResponse.json({ data: [] });
  return NextResponse.json({ data: r.data.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })) });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const machine = typeof b.machine === "string" ? b.machine.trim().slice(0, 60) : "";
  const kind = ["run", "stop", "service"].includes(b.kind) ? b.kind : "run";
  if (!machine || !isValidDate(b.date)) return NextResponse.json({ error: "Machine and date are needed." }, { status: 400 });
  const r = await safeDbCall(() => prisma.machineLog.create({ data: { date: b.date, machine, kind, hours: num(b.hours), powerUnits: num(b.powerUnits), downtimeMin: num(b.downtimeMin), note: typeof b.note === "string" ? b.note.slice(0, 300) : null, by: user.username } }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: r.data });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") || "";
  const r = await safeDbCall(() => prisma.machineLog.delete({ where: { id } }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ ok: true });
}
