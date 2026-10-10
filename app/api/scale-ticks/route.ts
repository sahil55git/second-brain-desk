// Recent settled scale readings, for the barrel desk's "ready to capture" box.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { TABLE_HINT, missingTable } from "@/lib/attachmentServer";
import { BARREL_DEFAULTS } from "@/lib/barrels";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const source = req.nextUrl.searchParams.get("source");
  const since = new Date(Date.now() - 15 * 60_000);
  const result = await safeDbCall(() =>
    prisma.scaleTick.findMany({
      where: { settledAt: { gte: since }, ...(source ? { source } : {}) },
      orderBy: { settledAt: "desc" },
      take: 6,
      select: { id: true, source: true, weightKg: true, settledAt: true, usedAt: true, usedBarrelCode: true, usedPhase: true },
    })
  );
  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
  return NextResponse.json({ data: result.data, maxAgeSec: BARREL_DEFAULTS.tickMaxAgeSec, serverNow: Date.now() });
}
