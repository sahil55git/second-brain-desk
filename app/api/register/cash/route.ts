// Cash tally desk — what the system expects in the counter for a date +
// session, plus the counts already saved for that date. Read-only.
import { NextRequest, NextResponse } from "next/server";
import { prisma, safeDbCall } from "@/lib/db";
import { computeOpening, getUser, isValidDate, loadConfig, movementsFor } from "@/lib/registerServer";
import { cashCutoffMs, toClosingBuckets, type RegisterEntryLike } from "@/lib/register";
import { cashGapFlag } from "@/lib/calculations";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const date = req.nextUrl.searchParams.get("date");
  const session = req.nextUrl.searchParams.get("session") === "AFTERNOON" ? "AFTERNOON" : "NIGHT";
  if (!isValidDate(date)) return NextResponse.json({ error: "date=YYYY-MM-DD is required" }, { status: 400 });
  const result = await safeDbCall(async () => {
    const cfg = await loadConfig();
    const [opening, { entries, jwEvents }, saved] = await Promise.all([
      computeOpening(date, cfg),
      movementsFor(date),
      prisma.dailyClosing.findMany({
        where: { date, OR: [{ source: null }, { source: { not: "register-stock" } }] },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const buckets = toClosingBuckets(opening.value, entries as unknown as RegisterEntryLike[], jwEvents, cashCutoffMs(date, session, Date.now()));
    const { systemCash } = cashGapFlag(buckets, 0);
    const last = (s: string) => saved.filter((c) => c.session === s).slice(-1)[0] || null;
    const pick = (c: (typeof saved)[number] | null) =>
      c && { id: c.id, createdAt: c.createdAt, counted: c.counterCashInr, system: c.systemCashInr, diff: c.cashDiffInr, mismatch: c.cashMismatch, denoms: c.denoms };
    return { opening: opening.value, buckets, systemCash, sessions: { AFTERNOON: pick(last("AFTERNOON")), NIGHT: pick(last("NIGHT")) } };
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({ data: result.data });
}
