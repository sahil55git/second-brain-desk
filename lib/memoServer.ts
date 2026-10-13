// Server side of the Cash tally (see lib/cashSheet.ts). Reads the separate memo tables;
// never touches RegisterEntry. One sheet gives every number the page and the report show.
import { prisma } from "./db";
import { appLines, isUpiLine } from "./memoTotals";
import { appSheet, buildSheet, isSheetLine, type SheetLine, type TypedLine } from "./cashSheet";
import type { CashEvent, RegisterEntryLike } from "./register";
import type { ScaleLine } from "./scaleReport";

export async function loadMemoView(date: string, entries: RegisterEntryLike[], jwEvents: CashEvent[], uptoMs: number | undefined, appOpening: number) {
  const [rows, scale, hand, logRows] = await Promise.all([
    prisma.cashMemoTotal.findMany({ where: { date }, orderBy: { updatedAt: "asc" } }),
    prisma.scaleReportScan.findUnique({ where: { date } }),
    prisma.cashHandover.findMany({ where: { date } }),
    // the log is extra: if its table is not there yet, the cash tally must still load
    prisma.cashTallyLog.findMany({ where: { date }, orderBy: { createdAt: "desc" }, take: 200 }).catch(() => []),
  ]);
  const lines = appLines(entries, jwEvents, uptoMs);
  const appUpi = { gpay: lines.SALE.upi + lines.UDHAAR.upi, phonepe: lines.SALE.phonepe + lines.UDHAAR.phonepe };
  const typed: Partial<Record<SheetLine, TypedLine>> = {};
  for (const r of rows) if (isSheetLine(r.line)) typed[r.line] = { amountInr: r.amountInr, enteredByName: r.enteredByName, updatedAt: r.updatedAt.toISOString() };
  const upiRow = (l: string) => rows.find((r) => r.line === l);
  const sheetApp = appSheet(appOpening, entries, jwEvents, uptoMs);
  const sheet = buildSheet(sheetApp, typed, { gpay: upiRow("UPI_GPAY")?.amountInr ?? null, phonepe: upiRow("UPI_PHONEPE")?.amountInr ?? null }, appUpi);
  const upi = Object.fromEntries(
    rows.filter((r) => isUpiLine(r.line)).map((r) => [r.line, { amountInr: r.amountInr, enteredByName: r.enteredByName, updatedAt: r.updatedAt.toISOString() }])
  ) as Record<string, { amountInr: number; enteredByName: string | null; updatedAt: string }>;
  return {
    sheet,
    sheetApp,
    appUpi,
    upi,
    adjustedCash: sheet.expected,
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
