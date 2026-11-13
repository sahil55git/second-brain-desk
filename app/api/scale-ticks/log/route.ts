// The weighing log: every settled weight saved on one business day (India time), newest first.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { getUser } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { TABLE_HINT, missingTable } from "@/lib/attachmentServer";
import { istDayRange } from "@/lib/scaleTickInput";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const date = req.nextUrl.searchParams.get("date") || businessDate(Date.now());
  const range = istDayRange(date);
  if (!range) return NextResponse.json({ error: "Bad date." }, { status: 400 });
  const source = req.nextUrl.searchParams.get("source");
  const result = await safeDbCall(() =>
    prisma.scaleTick.findMany({
      where: { settledAt: { gte: range.start, lt: range.end }, ...(source ? { source } : {}) },
      orderBy: { settledAt: "desc" },
      take: 500,
      select: { id: true, source: true, weightKg: true, settledAt: true, usedBarrelCode: true, usedPhase: true },
    })
  );
  if (!result.ok) return NextResponse.json({ error: missingTable(result.error) ? TABLE_HINT : result.error }, { status: 503 });
  return NextResponse.json({ data: result.data, date });
}
