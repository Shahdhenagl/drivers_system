-- ============================================================
-- ترحيل: تحصيل/سداد السلف الخارجية عبر المكتب كـ"أمانة" بساقين مستقلتين
--   collectedAmount = المحصَّل من المستلِف (borrower)
--   paidAmount      = المسلَّم للمُقرِض (lender)
-- السلفة تُعتبر SETTLED عندما تكتمل الساقان معًا. الأمانة المحتجزة = collectedAmount − paidAmount.
-- شغّل مرة واحدة في Supabase → SQL Editor. آمن للتكرار.
-- ============================================================
ALTER TABLE "ExternalAdvance"
  ADD COLUMN IF NOT EXISTS "collectedAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ExternalAdvance"
  ADD COLUMN IF NOT EXISTS "paidAmount" INTEGER NOT NULL DEFAULT 0;

-- اجعل السلف المسدَّدة سابقًا مكتملة الساقين حتى تتسق
UPDATE "ExternalAdvance"
  SET "collectedAmount" = "amount", "paidAmount" = "amount"
  WHERE "status" = 'SETTLED'
    AND "collectedAmount" = 0
    AND "paidAmount" = 0;
