// Shop-floor records (OpsRecord). GET ?kinds=a,b&from= → rows; POST { kind, date, ref?, data, status? };
// PATCH { id, data?, status? }; DELETE ?id= (owner). Staff may add floor records (godown, packing,
// settling, dip, counts); contracts, plans and item masters are owner-only.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate } from "@/lib/registerServer";
import { checkTransfer } from "@/lib/millTransfer";

export const dynamic = "force-dynamic";
const STAFF_KINDS = ["godown_in", "godown_out", "godown_check", "pack_move", "pack_run", "spare_move", "settle", "dip_read", "cycle_count", "photo_read", "mill_transfer"];
const OWNER_KINDS = ["contract", "pack_item", "pack_bom", "spare", "maint_plan", "dip_chart", "rule", "rule_fired"];
const ALL = STAFF_KINDS.concat(OWNER_KINDS);
const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? {}));

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const kinds = (req.nextUrl.searchParams.get("kinds") || "").split(",").filter((k) => ALL.includes(k));
  if (!kinds.length) return NextResponse.json({ error: "Which kinds?" }, { status: 400 });
  const from = req.nextUrl.searchParams.get("from");
  const r = await safeDbCall(() => prisma.opsRecord.findMany({ where: { kind: { in: kinds }, ...(isValidDate(from) ? { date: { gte: from! } } : {}) }, orderBy: [{ date: "asc" }, { createdAt: "asc" }], take: 5000 }));
  if (!r.ok) return NextResponse.json({ data: [] });
  return NextResponse.json({ data: r.data.map((x) => ({ ...x, createdAt: x.createdAt.toISOString(), updatedAt: x.updatedAt.toISOString() })) });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const kind = String(b.kind || "");
  if (!ALL.includes(kind)) return NextResponse.json({ error: "Unknown record." }, { status: 400 });
  if (OWNER_KINDS.includes(kind) && !user.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  if (!isValidDate(b.date)) return NextResponse.json({ error: "Date needed." }, { status: 400 });
  let data = json(b.data);
  if (kind === "mill_transfer") {
    // a transfer is a stock movement record: mill, tank and kg are checked, never guessed
    const t = checkTransfer(b.data);
    if (!t.ok) return NextResponse.json({ error: t.error }, { status: 400 });
    data = json(t.data);
  }
  if (JSON.stringify(data).length > 300_000) return NextResponse.json({ error: "Too big." }, { status: 400 });
  const r = await safeDbCall(() => prisma.opsRecord.create({ data: { kind, date: b.date, ref: typeof b.ref === "string" ? b.ref.slice(0, 80) : null, data, status: typeof b.status === "string" ? b.status.slice(0, 20) : "open", by: user.username } }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: r.data });
}

export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const cur = await safeDbCall(() => prisma.opsRecord.findUnique({ where: { id: String(b.id || "") } }));
  if (!cur.ok || !cur.data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (OWNER_KINDS.includes(cur.data.kind) && !user.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  // a logged oil transfer is not edited afterwards: the owner removes a wrong one and it is entered again
  if (cur.data.kind === "mill_transfer") return NextResponse.json({ error: "A saved transfer cannot be changed. The owner can remove it; then enter it again." }, { status: 403 });
  const r = await safeDbCall(() => prisma.opsRecord.update({ where: { id: cur.data!.id }, data: { ...(b.data ? { data: json({ ...(cur.data!.data as object), ...b.data }) } : {}), ...(typeof b.status === "string" ? { status: b.status.slice(0, 20) } : {}) } }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const r = await safeDbCall(() => prisma.opsRecord.delete({ where: { id: req.nextUrl.searchParams.get("id") || "" } }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ ok: true });
}
