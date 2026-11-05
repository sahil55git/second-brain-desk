// Purchase orders (owner). GET → list.
// POST { supplier, phone?, date, dueDate?, lines:[{item,qty,unit,rate,gst?}], notes?, terms?, deliverTo?, transport?, status?: "draft" } → new order.
// PATCH { id, … } with one of:
//   status: "open" | "closed" | "cancelled"     (a draft becomes open when it is sent or activated)
//   edit: { …same fields as POST }              (a sent order's revision number goes up)
//   markSent: true, via?: "whatsapp" | "share" | "print" | "link"
//   share: "create" | "revoke"                  (the supplier's read-only link /po/<token>)
// DELETE ?id=…  (drafts and cancelled orders only).
// What has arrived is worked out from purchases (lib/ops.ts). Form checks live in lib/po.ts.
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { featureOn } from "@/lib/featuresServer";
import { cleanPoInput } from "@/lib/po";

export const dynamic = "force-dynamic";

const NO_OWNER = () => NextResponse.json({ error: "Owner access required." }, { status: 403 });
const VIA = ["whatsapp", "share", "print", "link"];

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NO_OWNER();
  const r = await safeDbCall(() => prisma.purchaseOrder.findMany({ orderBy: { date: "desc" }, take: 300 }));
  if (!r.ok) return NextResponse.json({ data: [] });
  return NextResponse.json({
    data: r.data.map((o) => ({ ...o, sentAt: o.sentAt ? o.sentAt.toISOString() : null, createdAt: o.createdAt.toISOString(), updatedAt: o.updatedAt.toISOString() })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NO_OWNER();
  const b = await req.json().catch(() => ({}));
  const c = cleanPoInput(b);
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });
  const r = await safeDbCall(async () => {
    // next number = highest existing PO-<n> + 1 (old orders look like "PO-3-ABC")
    const rows = await prisma.purchaseOrder.findMany({ select: { no: true } });
    const top = rows.reduce((a, x) => Math.max(a, Number((/^PO-(\d+)/.exec(x.no) || [])[1]) || 0), 0);
    const make = (no: string) => prisma.purchaseOrder.create({ data: { no, supplier: c.data.supplier, phone: c.data.phone, date: c.data.date, dueDate: c.data.dueDate, lines: c.data.lines as unknown as object[], status: c.data.status, notes: c.data.notes, terms: c.data.terms, deliverTo: c.data.deliverTo, transport: c.data.transport, createdBy: user.username } });
    try { return await make(`PO-${top + 1}`); } catch { return make(`PO-${top + 1}-${Date.now().toString(36).slice(-3).toUpperCase()}`); }
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: r.data });
}

export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NO_OWNER();
  const b = await req.json().catch(() => ({}));
  const id = String(b.id || "");
  if (!id) return NextResponse.json({ error: "Which order?" }, { status: 400 });
  const found = await safeDbCall(() => prisma.purchaseOrder.findUnique({ where: { id } }));
  if (!found.ok) return NextResponse.json({ error: found.error }, { status: 503 });
  const po = found.data;
  if (!po) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (b.edit && typeof b.edit === "object") {
    if (po.status === "cancelled") return NextResponse.json({ error: "Reopen a cancelled order before changing it." }, { status: 400 });
    const c = cleanPoInput(b.edit as Record<string, unknown>);
    if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });
    Object.assign(data, { supplier: c.data.supplier, phone: c.data.phone, date: c.data.date, dueDate: c.data.dueDate, lines: c.data.lines, notes: c.data.notes, terms: c.data.terms, deliverTo: c.data.deliverTo, transport: c.data.transport });
    if (po.status === "draft") data.status = c.data.status; // "Save as draft" keeps it, "Activate" opens it
    else if (po.sentAt) data.rev = po.rev + 1; // the supplier already has the old one
  }
  if (typeof b.status === "string") {
    if (!["open", "closed", "cancelled"].includes(b.status)) return NextResponse.json({ error: "Status must be open, closed or cancelled." }, { status: 400 });
    data.status = b.status;
  }
  if (b.markSent === true) {
    data.sentAt = new Date();
    data.sentVia = VIA.includes(b.via) ? b.via : "share";
    if (po.status === "draft" && !data.status) data.status = "open";
  }
  if (b.share === "create" || b.share === "revoke") {
    if (b.share === "create") {
      if (!(await featureOn("poShare").catch(() => true))) return NextResponse.json({ error: "Order links are switched off in Settings → Features." }, { status: 403 });
      data.shareToken = po.shareToken || randomBytes(16).toString("base64url");
    } else data.shareToken = null;
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  const r = await safeDbCall(() => prisma.purchaseOrder.update({ where: { id }, data }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ ok: true, data: { ...r.data, sentAt: r.data.sentAt ? r.data.sentAt.toISOString() : null, createdAt: r.data.createdAt.toISOString(), updatedAt: r.data.updatedAt.toISOString() } });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user?.isOwner) return NO_OWNER();
  const id = req.nextUrl.searchParams.get("id") || "";
  const found = await safeDbCall(() => prisma.purchaseOrder.findUnique({ where: { id }, select: { status: true } }));
  if (!found.ok) return NextResponse.json({ error: found.error }, { status: 503 });
  if (!found.data) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (found.data.status !== "draft" && found.data.status !== "cancelled") return NextResponse.json({ error: "Only drafts and cancelled orders can be deleted. Cancel it first." }, { status: 400 });
  const r = await safeDbCall(() => prisma.purchaseOrder.delete({ where: { id } }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ ok: true });
}
