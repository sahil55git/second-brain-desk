-- Employee ledger. Vercel's build runs `prisma db push`, which creates these automatically;
-- this file is only for creating them by hand.
CREATE TABLE IF NOT EXISTS "Employee" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'Staff', "phone" TEXT,
  "monthlySalaryInr" DOUBLE PRECISION NOT NULL, "joinDate" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "EmployeeEntry" (
  "id" TEXT PRIMARY KEY, "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE CASCADE,
  "date" TEXT NOT NULL, "month" TEXT NOT NULL, "type" TEXT NOT NULL,
  "creditInr" DOUBLE PRECISION NOT NULL DEFAULT 0, "debitInr" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "mode" TEXT, "note" TEXT, "editNote" TEXT, "enteredBy" TEXT,
  "voidedAt" TIMESTAMP(3), "voidedBy" TEXT, "voidReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EmployeeEntry_employeeId_month_idx" ON "EmployeeEntry"("employeeId","month");
CREATE INDEX IF NOT EXISTS "EmployeeEntry_employeeId_voidedAt_idx" ON "EmployeeEntry"("employeeId","voidedAt");
CREATE TABLE IF NOT EXISTS "EmployeeEvent" (
  "id" TEXT PRIMARY KEY, "employeeId" TEXT NOT NULL REFERENCES "Employee"("id") ON DELETE CASCADE,
  "entryId" TEXT, "action" TEXT NOT NULL, "by" TEXT NOT NULL, "detail" JSONB, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EmployeeEvent_employeeId_at_idx" ON "EmployeeEvent"("employeeId","at");
