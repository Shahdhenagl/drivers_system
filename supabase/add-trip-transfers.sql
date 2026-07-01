-- ============================================================
-- ترحيل: تحويلات مالية على الرحلة (TripTransfer) + ربط السلف بالرحلة
-- شغّل مرة واحدة في Supabase → SQL Editor. آمن للتكرار.
-- ============================================================

-- جدول التحويلات المالية على الرحلة
CREATE TABLE IF NOT EXISTS "TripTransfer" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripTransfer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TripTransfer_tripId_idx" ON "TripTransfer"("tripId");

DO $$ BEGIN
  ALTER TABLE "TripTransfer"
    ADD CONSTRAINT "TripTransfer_tripId_fkey"
    FOREIGN KEY ("tripId") REFERENCES "Trip"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ربط السلف اختياريًا بالرحلة (سلفة المقاول من المكتب على رحلة)
ALTER TABLE "Advance" ADD COLUMN IF NOT EXISTS "tripId" TEXT;
CREATE INDEX IF NOT EXISTS "Advance_tripId_idx" ON "Advance"("tripId");
