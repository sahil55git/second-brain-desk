// Quick Register — save a cash count as a normal DailyClosing row.
// Tally 1 = AFTERNOON, Tally 2 = NIGHT. System cash is computed HERE on the
// server from the stored entries (never trusted from the browser), only
// counting what was logged up to this moment, then mapped into the Daily
// Closing desk's own cash buckets so cashGapFlag()'s ₹300 rule applies
// exactly as it does for counts entered on the Daily Closing desk.
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma, safeDbCall } from "@/lib/db";
import { cashGapFlag } from "@/lib/calculations";
import { computeOpening, getUser, isValidDate, loadConfig, movementsFor } from "@/lib/registerServer";
import { DENOMINATIONS, businessDate, cashCutoffMs, denominationTotal, toClosingBuckets, type RegisterEntryLike } from "@/lib/register";
import { sessionStamp } from "@/lib/stockTally";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const session = body.session === "NIGHT" ? "NIGHT" : body.session === "AFTERNOON" ? "AFTERNOON" : null;
  if (!session || !isValidDate(body.date)) {
    return NextResponse.json({ error: "date and session (AFTERNOON|NIGHT) are required" }, { status: 400 });
  }
  // Late entry: never the future; staff may go back one day, the owner further.
  const todayIst = businessDate(Date.now());
  if (body.date > todayIst) return NextResponse.json({ error: "A cash count cannot be dated in the future." }, { status: 400 });
  if (!user.isOwner && body.date < businessDate(Date.now() - 86400000)) {
    return NextResponse.json({ error: "Staff can enter today's or yesterday's cash count. Ask the owner for older days." }, { status: 403 });
  }
  const denoms: Record<string, number> = {};
  for (const d of DENOMINATIONS) {
    const n = Math.max(0, Math.floor(Number(body.denoms?.[String(d)]) || 0));
    if (n) denoms[String(d)] = n;
  }
  const coins = Math.max(0, Number(body.coins) || 0);
  const counted = denominationTotal(denoms, coins);

  const result = await safeDbCall(async () => {
    const now = new Date();
    const cfg = await loadConfig();
    const [opening, { entries, jwEvents }] = await Promise.all([
      computeOpening(body.date, cfg),
      movementsFor(body.date),
    ]);
    const buckets = toClosingBuckets(
      opening.value,
      entries as unknown as RegisterEntryLike[],
      jwEvents,
      cashCutoffMs(body.date, session, now.getTime())
    );
    const { systemCash, diff, flagged } = cashGapFlag(buckets, counted);
    // If a stock-only row already exists for this session (stock tally taken
    // first), fill in its cash instead of creating a second row.
    const stockOnly = await prisma.dailyClosing.findFirst({
      where: { date: body.date, session, source: "register-stock" },
      orderBy: { createdAt: "desc" },
    });
    if (stockOnly) {
      return prisma.dailyClosing.update({
        where: { id: stockOnly.id },
        data: {
          ...buckets,
          counterCashInr: counted,
          systemCashInr: systemCash,
          cashDiffInr: diff,
          cashMismatch: flagged,
          denoms: { ...denoms, coins } as Prisma.InputJsonValue,
          source: "register",
        },
      });
    }
    return prisma.dailyClosing.create({
      data: {
        date: body.date,
        session,
        ...buckets,
        counterCashInr: counted,
        systemCashInr: systemCash,
        cashDiffInr: diff,
        cashMismatch: flagged,
        denoms: { ...denoms, coins } as Prisma.InputJsonValue,
        source: "register",
        createdAt: body.date === todayIst ? now : sessionStamp(body.date, session),
      },
    });
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data }, { status: 201 });
}
