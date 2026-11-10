// Activity log — GET only, owner only. Newest first, filtered by entity and
// business-date range. Nothing here (or anywhere else) edits or deletes rows.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { requireOwner } from "@/lib/ownerGuard";
import { dayRange, isValidDate } from "@/lib/registerServer";
import { AUDIT_ENTITIES } from "@/lib/auditFormat";

export const dynamic = "force-dynamic";

const MAX_ROWS = 1000;

export async function GET(req: NextRequest) {
  const g = await requireOwner(req);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const q = req.nextUrl.searchParams;
  const entity = q.get("entity");
  const from = q.get("from");
  const to = q.get("to");
  if (entity && !(AUDIT_ENTITIES as readonly string[]).includes(entity)) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 400 });
  }
  if ((from && !isValidDate(from)) || (to && !isValidDate(to))) {
    return NextResponse.json({ error: "from / to must be YYYY-MM-DD" }, { status: 400 });
  }
  const limit = Math.min(Math.max(Number(q.get("limit")) || 300, 1), MAX_ROWS);

  const at: { gte?: Date; lt?: Date } = {};
  if (from) at.gte = dayRange(from).start;
  if (to) at.lt = dayRange(to).end;

  const result = await safeDbCall(() =>
    prisma.auditLog.findMany({
      where: { ...(entity ? { entity } : {}), ...(from || to ? { at } : {}) },
      orderBy: { at: "desc" },
      take: limit,
    })
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data });
}
