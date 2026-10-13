// Server side of the Cash tally memo totals (see lib/memoTotals.ts). Reads the
// separate memo tables; never touches RegisterEntry.
import { prisma } from "./db";
import { withUpiTaken, appLines, extrasDelta, extrasTyped, isExtraLine, isMemoLine, isUpiLine, memoAdjustedCash, type ExtraTotals, type MemoRow } from "./memoTotals";
import type { CashEvent, RegisterEntryLike } from "./register";
import type { ScaleLine } from "./scaleReport";

export async function loadMemoView(date: string, entries: RegisterEntryLike[], jwEvents: CashEvent[], uptoMs: number | undefined, appSystemCash: number, appOpening = 0) {
  const [rows, scale, hand, logRows] = await Promise.all([
    prisma.cashMemoTotal.findMany({ where: { date }, orderBy: { updatedAt: "asc" } }),
    prisma.scaleReportScan.findUnique({ where: { date } }),
    prisma.cashHandover.findMany({ where: { date } }),
    prisma.cashTallyLog.findMany({ where: { date }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  const app = appLines(entries, jwEvents, uptoMs);
  const memoRaw: (MemoRow & { updatedAt: string })[] = rows
    .filter((r) => isMemoLine(r.line))
    .map((r) => ({ line: r.line as MemoRow["line"], amountInr: r.amountInr, cashInr: r.cashInr, qty: r.qty, unit: r.unit, source: r.source, enteredByName: r.enteredByName, updatedAt: r.updatedAt.toISOString() }));
  const upi = Object.fromEntries(
    rows.filter((r) => isUpiLine(r.line)).map((r) => [r.line, { amountInr: r.amountInr, enteredByName: r.enteredByName, updatedAt: r.updatedAt.toISOString() }])
  ) as Record<string, { amountInr: number; enteredByName: string | null; updatedAt: string }>;
  const upiSum = rows.filter((r) => isUpiLine(r.line)).reduce((a, r) => a + r.amountInr, 0);
  const memo = withUpiTaken(memoRaw, upiSum) as (MemoRow & { updatedAt: string })[];
  const amt = (l: string) => rows.find((r) => r.line === l)?.amountInr;
  const extras: ExtraTotals = { opening: amt("OPENING") ?? null, otherIn: amt("OTHER_IN") ?? 0, ownerDraw: amt("OWNER_DRAW") ?? 0 };
  const memoOnly = memoAdjustedCash(appSystemCash, app, memo);
  const extraRows = rows.filter((r) => isExtraLine(r.line)).map((r) => ({ line: r.line, amountInr: r.amountInr, enteredByName: r.enteredByName, updatedAt: r.updatedAt.toISOString() }));
  return {
    app,
    memo,
    upi,
    extras,
    extraRows,
    extrasTyped: extrasTyped(extras),
    memoDelta: Math.round((memoOnly - appSystemCash) * 100) / 100,
    adjustedCash: Math.round((memoOnly + extrasDelta(extras, appOpening)) * 100) / 100,
    log: logRows.map((l) => ({ id: l.id, line: l.line, action: l.action, amountInr: l.amountInr, prevInr: l.prevInr, session: l.session, enteredByName: l.enteredByName, createdAt: l.createdAt.toISOString() })),
    scale: scale && {
      totalKg: scale.totalKg,
      totalInr: scale.totalInr,
      taxInr: scale.taxInr,
      lines: (scale.lines as unknown as ScaleLine[]) || [],
      enteredByName: scale.enteredByName,
      updatedAt: scale.updatedAt.toISOString(),
    },
    handovers: Object.fromEntries(hand.map((h) => [h.session, { countedBy: h.countedBy, handedTo: h.handedTo, enteredByName: h.enteredByName, updatedAt: h.updatedAt.toISOString() }])),
  };
}
