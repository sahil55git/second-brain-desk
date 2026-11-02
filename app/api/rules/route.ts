// ⚡ Rules (owner). GET → rules + what would fire now; POST { name, when, then } → new rule;
// PATCH { id, on?, name?, when?, then? }; DELETE ?id=. Sending happens with the morning/evening run.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { loadRules, runRules } from "@/lib/rulesServer";
import { businessDate } from "@/lib/register";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const r = await safeDbCall(async () => ({ rules: await loadRules(), now: req.nextUrl.searchParams.get("test") ? (await runRules({ send: false })).fired : [] }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: r.data });
}
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.when?.t || typeof b.name !== "string") return NextResponse.json({ error: "Name and condition needed." }, { status: 400 });
  const data = JSON.parse(JSON.stringify({ name: b.name.slice(0, 80), when: b.when, then: { alert: b.then?.alert !== false, task: !!b.then?.task, text: typeof b.then?.text === "string" ? b.then.text.slice(0, 120) : undefined } }));
  const r = await safeDbCall(() => prisma.opsRecord.create({ data: { kind: "rule", date: businessDate(Date.now()), data, status: "on", by: user.username } }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: r.data });
}
export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const cur = await prisma.opsRecord.findUnique({ where: { id: String(b.id || "") } }).catch(() => null);
  if (!cur || cur.kind !== "rule") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const data = { ...(cur.data as object), ...(b.name ? { name: String(b.name).slice(0, 80) } : {}), ...(b.when ? { when: b.when } : {}), ...(b.then ? { then: b.then } : {}) };
  await prisma.opsRecord.update({ where: { id: cur.id }, data: { data: JSON.parse(JSON.stringify(data)), ...(typeof b.on === "boolean" ? { status: b.on ? "on" : "off" } : {}) } });
  return NextResponse.json({ ok: true });
}
export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  await prisma.opsRecord.deleteMany({ where: { id: req.nextUrl.searchParams.get("id") || "", kind: "rule" } });
  return NextResponse.json({ ok: true });
}
