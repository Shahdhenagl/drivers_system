-- External advances between contractors and drivers.
-- These records are informational only and must not touch Ledger/cash balances.

CREATE TABLE IF NOT EXISTS "ExternalAdvance" (
  "id" TEXT PRIMARY KEY,
  "borrowerType" TEXT NOT NULL,
  "borrowerId" TEXT NOT NULL,
  "borrowerName" TEXT NOT NULL,
  "lenderType" TEXT NOT NULL,
  "lenderId" TEXT NOT NULL,
  "lenderName" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ExternalAdvance_borrowerType_borrowerId_idx"
  ON "ExternalAdvance"("borrowerType", "borrowerId");

CREATE INDEX IF NOT EXISTS "ExternalAdvance_lenderType_lenderId_idx"
  ON "ExternalAdvance"("lenderType", "lenderId");

CREATE INDEX IF NOT EXISTS "ExternalAdvance_status_idx"
  ON "ExternalAdvance"("status");

CREATE INDEX IF NOT EXISTS "ExternalAdvance_date_idx"
  ON "ExternalAdvance"("date");
