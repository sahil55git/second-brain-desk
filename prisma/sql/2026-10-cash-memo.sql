-- Cash tally: memo-sheet totals, scale report scans, shift handover.
-- Vercel's build runs `prisma db push`, which creates these automatically.
-- Run by hand only if you manage the database yourself.
CREATE TABLE IF NOT EXISTS "CashMemoTotal" (
  "id" TEXT PRIMARY KEY, "date" TEXT NOT NULL, "line" TEXT NOT NULL,
  "amountInr" DOUBLE PRECISION NOT NULL, "cashInr" DOUBLE PRECISION NOT NULL,
  "qty" DOUBLE PRECISION, "unit" TEXT, "source" TEXT NOT NULL DEFAULT 'typed',
  "enteredByName" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "CashMemoTotal_date_line_key" ON "CashMemoTotal"("date","line");
CREATE INDEX IF NOT EXISTS "CashMemoTotal_date_idx" ON "CashMemoTotal"("date");
CREATE TABLE IF NOT EXISTS "ScaleReportScan" (
  "id" TEXT PRIMARY KEY, "date" TEXT NOT NULL, "totalKg" DOUBLE PRECISION, "totalInr" DOUBLE PRECISION, "taxInr" DOUBLE PRECISION,
  "lines" JSONB NOT NULL, "enteredByName" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ScaleReportScan_date_key" ON "ScaleReportScan"("date");
CREATE TABLE IF NOT EXISTS "CashHandover" (
  "id" TEXT PRIMARY KEY, "date" TEXT NOT NULL, "session" TEXT NOT NULL, "countedBy" TEXT NOT NULL, "handedTo" TEXT NOT NULL,
  "enteredByName" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "CashHandover_date_session_key" ON "CashHandover"("date","session");
