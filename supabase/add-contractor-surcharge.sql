-- ============================================================
-- ترحيل: إضافة "زيادة على المقاول" (contractorSurcharge) لجدول Trip
-- شغّل مرة واحدة في Supabase → SQL Editor. آمن للتكرار.
-- ============================================================
ALTER TABLE "Trip"
  ADD COLUMN IF NOT EXISTS "contractorSurcharge" INTEGER NOT NULL DEFAULT 0;
