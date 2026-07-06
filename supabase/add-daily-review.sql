-- ============================================================
-- ترحيل: إضافة "آخر مراجعة يومية" (lastReviewedAt) للمقاول والسواق
-- علامة الصح للمراجعة اليومية تُشتق من هذا العمود وتتصفّر تلقائيًا كل يوم.
-- شغّل مرة واحدة في Supabase → SQL Editor. آمن للتكرار.
-- ============================================================
ALTER TABLE "Contractor"
  ADD COLUMN IF NOT EXISTS "lastReviewedAt" TIMESTAMP(3);

ALTER TABLE "Driver"
  ADD COLUMN IF NOT EXISTS "lastReviewedAt" TIMESTAMP(3);
