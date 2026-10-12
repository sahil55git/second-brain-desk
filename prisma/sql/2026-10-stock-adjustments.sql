-- Stock corrections (StockAdjustment). Same result as `prisma db push` for the
-- schema change in prisma/schema.prisma. Run once on the production database.

CREATE TYPE "AdjustmentReason" AS ENUM (
  'COUNT_DIFFERENCE',
  'BREAKAGE',
  'SPILLAGE',
  'OPENING_CORRECTION',
  'OTHER',
  'REVERSAL'
);

CREATE TABLE "StockAdjustment" (
  "id"         TEXT NOT NULL,
  "date"       TEXT NOT NULL,
  "itemId"     TEXT NOT NULL,
  "bookQty"    DOUBLE PRECISION NOT NULL,
  "actualQty"  DOUBLE PRECISION NOT NULL,
  "qtyDelta"   DOUBLE PRECISION NOT NULL,
  "reason"     "AdjustmentReason" NOT NULL,
  "note"       TEXT,
  "reversesId" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockAdjustment_reversesId_key" ON "StockAdjustment"("reversesId");
CREATE INDEX "StockAdjustment_itemId_date_idx" ON "StockAdjustment"("itemId", "date");

ALTER TABLE "StockAdjustment"
  ADD CONSTRAINT "StockAdjustment_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
