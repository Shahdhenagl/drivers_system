-- ============================================================
-- ترحيل: الحساب المشترك (سواق ومقاول معًا)
-- linkId يربط سجل المقاول بسجل السواق لنفس الشخص. الاثنان يظهران كملف موحّد.
-- شغّل مرة واحدة في Supabase → SQL Editor. آمن للتكرار.
-- ============================================================
ALTER TABLE "Contractor"
  ADD COLUMN IF NOT EXISTS "linkId" TEXT;
ALTER TABLE "Driver"
  ADD COLUMN IF NOT EXISTS "linkId" TEXT;

CREATE INDEX IF NOT EXISTS "Contractor_linkId_idx" ON "Contractor" ("linkId");
CREATE INDEX IF NOT EXISTS "Driver_linkId_idx" ON "Driver" ("linkId");
