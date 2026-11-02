// Customer orders for the shop (any signed-in user). GET ?status= → list (not drafts);
// POST { name, phone?, lines:[{item,qty,unit,rate}], note? } → a phone / counter order;
// PATCH { id, status } → packed / delivered / cancelled (tells the customer on WhatsApp when set up).
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { waReady, waText } from "@/lib/wa";

export const dynamic = "force-dynamic";
const STATUSES = ["new", "packed", "delivered", "cancelled"];
const SAY: Record<string, string> = { packed: "is packed and ready 📦", delivered: "is delivered ✅ Thank you!", cancelled: "was cancelled." };

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const st = req.nextUrl.searchParams.get("status");
  const r = await safeDbCall(() => prisma.customerOrder.findMany({ where: st && STATUSES.includes(st) ? { status: st } : { status: { not: "draft" } }, orderBy: { createdAt: "desc" }, take: 200 }));
  if (!r.ok) return NextResponse.json({ data: [] });
  return NextResponse.json({ data: r.data.map((o) => ({ ...o, createdAt: o.createdAt.toISOString(), updatedAt: o.updatedAt.toISOString() })), wa: waReady() });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const lines = (Array.isArray(b.lines) ? b.lines : []).map((l: Record<string, unknown>) => {
    const qty = Number(l.qty) || 0, rate = Number(l.rate) || null;
    return { item: String(l.item || "").slice(0, 80), qty, unit: String(l.unit || "kg").slice(0, 10), rate, amount: rate ? Math.round(rate * qty * 100) / 100 : null };
  }).filter((l: { item: string; qty: number }) => l.item && l.qty > 0);
  if (!lines.length) return NextResponse.json({ error: "Add at least one item." }, { status: 400 });
  const total = lines.every((l: { amount: number | null }) => l.amount != null) ? lines.reduce((a: number, l: { amount: number }) => a + l.amount, 0) : null;
  const r = await safeDbCall(async () => {
    const n = await prisma.customerOrder.count();
    return prisma.customerOrder.create({ data: { no: `SO-${n + 1}`, channel: "app", name: typeof b.name === "string" ? b.name.slice(0, 80) : null, phone: typeof b.phone === "string" ? b.phone.replace(/\D/g, "").slice(-12) || null : null, lines, totalInr: total, status: "new", note: typeof b.note === "string" ? b.note.slice(0, 300) : null } });
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: r.data });
}

export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!STATUSES.includes(b.status)) return NextResponse.json({ error: "Bad status." }, { status: 400 });
  const r = await safeDbCall(() => prisma.customerOrder.update({ where: { id: String(b.id || "") }, data: { status: b.status } }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  let told = false;
  if (r.data.channel === "whatsapp" && r.data.phone && SAY[b.status] && waReady()) {
    told = await waText(r.data.phone, `Your order ${r.data.no} ${SAY[b.status]}`).then(() => true).catch(() => false);
  }
  return NextResponse.json({ ok: true, told });
}
