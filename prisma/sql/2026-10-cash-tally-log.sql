-- Cash tally: append-only entry log (date, time, who, old and new value).
-- Vercel's build runs `prisma db push`, which creates this automatically.
CREATE TABLE IF NOT EXISTS "CashTallyLog" (
  "id" TEXT PRIMARY KEY, "date" TEXT NOT NULL, "line" TEXT NOT NULL, "action" TEXT NOT NULL,
  "amountInr" DOUBLE PRECISION, "prevInr" DOUBLE PRECISION, "session" TEXT, "note" TEXT,
  "enteredByName" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CashTallyLog_date_createdAt_idx" ON "CashTallyLog"("date","createdAt");
