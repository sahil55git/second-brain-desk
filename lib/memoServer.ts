// Server side of the Cash tally memo totals (see lib/memoTotals.ts). Reads the
// separate memo tables; never touches RegisterEntry.
import { prisma } from "./db";
import { appLines, isMemoLine, memoAdjustedCash, type MemoRow } from "./memoTotals";
import type { CashEvent, RegisterEntryLike } from "./register";
import type { ScaleLine } from "./scaleReport";

export async function loadMemoView(date: string, entries: RegisterEntryLike[], jwEvents: CashEvent[], uptoMs: number | undefined, appSystemCash: number) {
  const [rows, scale, hand] = await Promise.all([
    prisma.cashMemoTotal.findMany({ where: { date }, orderBy: { updatedAt: "asc" } }),
    prisma.scaleReportScan.findUnique({ where: { date } }),
    prisma.cashHandover.findMany({ where: { date } }),
  ]);
  const app = appLines(entries, jwEvents, uptoMs);
  const memo: (MemoRow & { updatedAt: string })[] = rows
    .filter((r) => isMemoLine(r.line))
    .map((r) => ({ line: r.line as MemoRow["line"], amountInr: r.amountInr, cashInr: r.cashInr, qty: r.qty, unit: r.unit, source: r.source, enteredByName: r.enteredByName, updatedAt: r.updatedAt.toISOString() }));
  return {
    app,
    memo,
    adjustedCash: memoAdjustedCash(appSystemCash, app, memo),
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
