-- أرشفة كشف الحساب: عمود يخزّن تاريخ آخر "بدء حساب جديد" لكل مقاول/سواق.
-- الكشف على الشاشة يعرض الحركات الأحدث من هذا التاريخ فقط.
-- البيانات كلها تبقى محفوظة (الربح والتقارير تظل صحيحة) — التصفير للعرض فقط.

ALTER TABLE "Contractor" ADD COLUMN IF NOT EXISTS "statementClearedAt" TIMESTAMP(3);
ALTER TABLE "Driver"     ADD COLUMN IF NOT EXISTS "statementClearedAt" TIMESTAMP(3);
