-- ============================================================
-- ترحيل: حجز متعدد الأيام — ربط أيام الرحلة الواحدة عبر groupId
-- شغّل مرة واحدة في Supabase → SQL Editor. آمن للتكرار.
-- ============================================================
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "groupId" TEXT;
CREATE INDEX IF NOT EXISTS "Trip_groupId_idx" ON "Trip"("groupId");
