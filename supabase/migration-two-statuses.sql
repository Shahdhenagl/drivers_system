-- ============================================================
-- توحيد حالات الطلب في حالتين فقط: CONFIRMED (مؤكدة) و COMPLETED (مكتملة)
-- • «مكتملة» = تم التحصيل بالكامل من المقاول + سداد مستحق السواق بالكامل.
-- • أي حالة قديمة (NEW / IN_PROGRESS) تصير «مؤكدة».
-- • الطلبات الملغية: الغرامة كانت هي قيمتها الفعلية، فتصير هي سعر المقاول
--   ومستحق السواق، ثم تُعامَل كطلب عادي (خانات الغرامة تتصفّر).
-- شغّله مرة واحدة في Supabase → SQL Editor بعد رفع الكود.
-- ============================================================

BEGIN;

-- 1) الطلبات الملغية: الغرامة تصبح قيمة الطلب (السماح = صفر)
UPDATE "Trip"
SET "contractorPrice" = "contractorPenalty",
    "driverDue" = "driverPenalty",
    "driverTip" = 0,
    "customerDiscount" = 0,
    "contractorSurcharge" = 0
WHERE status = 'CANCELLED';

-- 2) تصفير خانات الغرامة (لم تعد تُستخدم)
UPDATE "Trip"
SET "contractorPenalty" = 0, "driverPenalty" = 0
WHERE "contractorPenalty" <> 0 OR "driverPenalty" <> 0;

-- 3) إعادة اشتقاق الحالة وحالة التحصيل من واقع الحركات
WITH sums AS (
  SELECT
    t.id,
    t."contractorPrice" - t."customerDiscount" + t."contractorSurcharge" AS eff_contractor,
    t."driverDue" + t."driverTip" AS eff_driver,
    COALESCE((SELECT SUM(c.amount) FROM "Collection" c WHERE c."tripId" = t.id), 0) AS collected,
    COALESCE((SELECT SUM(p.amount) FROM "DriverPayment" p WHERE p."tripId" = t.id), 0) AS paid
  FROM "Trip" t
)
UPDATE "Trip" t
SET status = CASE
      WHEN s.collected >= s.eff_contractor AND s.paid >= s.eff_driver THEN 'COMPLETED'
      ELSE 'CONFIRMED'
    END,
    "collectionStatus" = CASE
      WHEN s.collected <= 0 THEN 'NONE'
      WHEN s.collected >= s.eff_contractor THEN 'FULL'
      ELSE 'PARTIAL'
    END
FROM sums s
WHERE s.id = t.id;

COMMIT;
