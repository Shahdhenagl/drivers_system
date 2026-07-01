-- ============================================================
-- ترحيل: إضافة جدول سلف السواقين (DriverAdvance)
-- شغّل هذا مرة واحدة في Supabase → SQL Editor على قاعدة الإنتاج.
-- آمن للتكرار (IF NOT EXISTS).
-- ============================================================
CREATE TABLE IF NOT EXISTS "DriverAdvance" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverAdvance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DriverAdvance_driverId_idx" ON "DriverAdvance"("driverId");

DO $$ BEGIN
  ALTER TABLE "DriverAdvance"
    ADD CONSTRAINT "DriverAdvance_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "Driver"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
