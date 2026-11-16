// One stock figure per oil (lib/stockLedger.ts): the last count carried forward, the book since
// the first count, and the gap between them. Kilograms only, no money, so anyone who can open
// the Stock page may read it. GET ?asOf=YYYY-MM-DD[&key=<row>] (key adds 45 days, day by day).
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { loadHubData } from "@/lib/hubData";
import { getUser, isValidDate } from "@/lib/registerServer";
import { businessDate } from "@/lib/register";
import { ledgerCounts, ledgerDays, ledgerMoves, stockLedger, type OpsLite } from "@/lib/stockLedger";
import type { BizData } from "@/lib/bizReports";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const today = businessDate(Date.now());
  const asOf = req.nextUrl.searchParams.get("asOf") || today;
  if (!isValidDate(asOf) || asOf > today) return NextResponse.json({ error: "asOf=YYYY-MM-DD, not in the future." }, { status: 400 });
  const key = req.nextUrl.searchParams.get("key");

  const hub = await safeDbCall(() => loadHubData(asOf, asOf));
  if (!hub.ok) return NextResponse.json({ error: hub.error }, { status: 503 });
  // mill transfers and packing runs live in OpsRecord; a database without that table just has none
  const opsRes = await safeDbCall(() => prisma.opsRecord.findMany({ where: { kind: { in: ["mill_transfer", "pack_run"] }, date: { lte: asOf } }, select: { id: true, kind: true, date: true, data: true, createdAt: true } }));
  const ops: OpsLite[] = opsRes.ok
    ? opsRes.data.map((r: { id: string; kind: string; date: string; data: unknown; createdAt: Date }) => ({ id: r.id, kind: r.kind, date: r.date, data: (r.data && typeof r.data === "object" ? r.data : {}) as Record<string, unknown>, createdAt: r.createdAt.toISOString() }))
    : [];
  const saved = await safeDbCall(() => prisma.appSetting.findUnique({ where: { key: "stockLedger" } }));

  const data = JSON.parse(JSON.stringify(hub.data)) as BizData; // dates → text, the shape the reports use
  const { moves, notCounted } = ledgerMoves(data, ops);
  const counts = ledgerCounts(data.closings);
  const ledger = stockLedger(moves, counts, notCounted, asOf, saved.ok ? saved.data?.data : null);
  const days = key ? ledgerDays(key, moves, counts, businessDate(Date.parse(`${asOf}T12:00:00+05:30`) - 44 * 86400000), asOf) : undefined;
  return NextResponse.json({ data: ledger, days, isOwner: user.isOwner });
}
