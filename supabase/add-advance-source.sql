-- ============================================================
-- ترحيل: إضافة مصدر السلفة (استلفها من مين) لجدول Advance
-- شغّل مرة واحدة في Supabase → SQL Editor. آمن للتكرار.
-- (شغّل add-advances.sql الأول لو لسه ما عملتهوش)
-- ============================================================
ALTER TABLE "Advance" ADD COLUMN IF NOT EXISTS "sourceType" TEXT;
ALTER TABLE "Advance" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;
ALTER TABLE "Advance" ADD COLUMN IF NOT EXISTS "sourceName" TEXT;
