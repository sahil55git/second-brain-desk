// Purchase orders (owner). GET → list; POST { supplier, phone?, date, dueDate?, lines:[{item,qty,unit,rate}], notes? };
// PATCH { id, status: "open" | "cancelled" }. What has arrived is worked out from purchases (lib/ops.ts).
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser, isValidDate } from "@/lib/registerServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const r = await safeDbCall(() => prisma.purchaseOrder.findMany({ orderBy: { date: "desc" }, take: 300 }));
  if (!r.ok) return NextResponse.json({ data: [] });
  return NextResponse.json({ data: r.data.map((o) => ({ ...o, createdAt: o.createdAt.toISOString(), updatedAt: o.updatedAt.toISOString() })) });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const supplier = typeof b.supplier === "string" ? b.supplier.trim().slice(0, 120) : "";
  const lines = (Array.isArray(b.lines) ? b.lines : [])
    .map((l: Record<string, unknown>) => ({ item: String(l.item || "").trim().slice(0, 80), qty: Number(l.qty) || 0, unit: String(l.unit || "kg").slice(0, 10), rate: Number(l.rate) || 0 }))
    .filter((l: { item: string; qty: number }) => l.item && l.qty > 0)
    .slice(0, 20);
  if (!supplier || !lines.length || !isValidDate(b.date)) return NextResponse.json({ error: "Supplier, date and at least one item with quantity are needed." }, { status: 400 });
  const due = isValidDate(b.dueDate) ? b.dueDate : null;
  const r = await safeDbCall(async () => {
    const n = await prisma.purchaseOrder.count();
    return prisma.purchaseOrder.create({ data: { no: `PO-${n + 1}-${Date.now().toString(36).slice(-3).toUpperCase()}`, supplier, phone: typeof b.phone === "string" ? b.phone.slice(0, 20) : null, date: b.date, dueDate: due, lines, notes: typeof b.notes === "string" ? b.notes.slice(0, 300) : null, createdBy: user.username } });
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: r.data });
}

export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const status = b.status === "cancelled" ? "cancelled" : "open";
  const r = await safeDbCall(() => prisma.purchaseOrder.update({ where: { id: String(b.id || "") }, data: { status } }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ ok: true });
}
