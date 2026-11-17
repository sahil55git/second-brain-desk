// One held counter bill: open it on this device (claim), update it, or remove it (paid / dropped).
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { canClaim, parseHold } from "@/lib/counterHold";

type Ctx = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const device = typeof body?.device === "string" ? body.device.slice(0, 60) : "";
  const found = await safeDbCall(() => prisma.counterHold.findUnique({ where: { id: params.id } }));
  if (!found.ok) return NextResponse.json({ error: found.error }, { status: 503 });
  const h = found.data;
  if (!h) return NextResponse.json({ error: "This bill was already paid or removed." }, { status: 404 });

  if (body?.claim) {
    if (!device) return NextResponse.json({ error: "Device missing." }, { status: 400 });
    if (!canClaim(h, device) && !body.force) {
      return NextResponse.json({ error: "Another device has this bill open.", openedBy: h.openedBy, openedAt: h.openedAt }, { status: 409 });
    }
    const r = await safeDbCall(() => prisma.counterHold.update({ where: { id: h.id }, data: { openedBy: device, openedAt: new Date() } }));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
    return NextResponse.json({ data: r.data });
  }
  if (body?.release) {
    const r = await safeDbCall(() => prisma.counterHold.update({ where: { id: h.id }, data: { openedBy: null, openedAt: null } }));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
    return NextResponse.json({ data: r.data });
  }
  // put the (changed) bill back on hold
  const p = parseHold(body?.data);
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });
  const r = await safeDbCall(() =>
    prisma.counterHold.update({ where: { id: h.id }, data: { label: p.label, total: p.total, data: p.data as unknown as object, openedBy: null, openedAt: null } })
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: r.data });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!(await getUser(req))) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const r = await safeDbCall(() => prisma.counterHold.deleteMany({ where: { id: params.id } }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: { deleted: r.data.count } });
}
