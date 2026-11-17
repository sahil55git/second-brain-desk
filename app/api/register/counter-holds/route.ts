// Held Weigh & Bill counter bills, shared by every device (list + hold).
// Holding never touches cash or stock; paying the bill (a register SALE) does.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { parseHold } from "@/lib/counterHold";

export async function GET(req: NextRequest) {
  if (!(await getUser(req))) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const r = await safeDbCall(() => prisma.counterHold.findMany({ orderBy: { createdAt: "asc" }, take: 100 }));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: r.data });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const p = parseHold(body?.data);
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });
  const r = await safeDbCall(() =>
    prisma.counterHold.create({ data: { label: p.label, total: p.total, data: p.data as unknown as object, heldBy: user.name || user.username || null } })
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 503 });
  return NextResponse.json({ data: r.data }, { status: 201 });
}
