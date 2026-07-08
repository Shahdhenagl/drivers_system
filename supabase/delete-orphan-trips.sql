-- ============================================================
-- ⚠️ حذف الطلبات اليتيمة — لا يمكن التراجع. خُذ Backup أولًا.
-- يمسح أي طلب: مالوش سواق (driverId فارغ / السواق اتمسح)، أو مقاوله اتمسح،
-- أو سواقه اتمسح. ويشيل معاه كل أثره من الإحصائيات:
--   التحصيلات + السداد + التحويلات + قيود دفتر الأستاذ المرتبطة + السلف المرتبطة بالطلب.
-- شغّله مرة في Supabase → SQL Editor.
-- ============================================================

-- (اختياري) اعرف العدد قبل الحذف — شغّل السطر ده لوحده أول:
-- SELECT count(*) FROM "Trip" t
--   WHERE t."driverId" IS NULL
--      OR NOT EXISTS (SELECT 1 FROM "Contractor" c WHERE c.id = t."contractorId")
--      OR (t."driverId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Driver" d WHERE d.id = t."driverId"));

BEGIN;

-- 1) الطلبات المستهدفة في جدول مؤقت
CREATE TEMP TABLE _bad_trips ON COMMIT DROP AS
SELECT t.id FROM "Trip" t
WHERE t."driverId" IS NULL
   OR NOT EXISTS (SELECT 1 FROM "Contractor" c WHERE c.id = t."contractorId")
   OR (t."driverId" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "Driver" d WHERE d.id = t."driverId"));

-- 2) قيود الدفتر المرتبطة بتحصيلات هذه الطلبات
DELETE FROM "LedgerEntry"
WHERE "refType" = 'Collection' AND "refId" IN (
  SELECT id FROM "Collection" WHERE "tripId" IN (SELECT id FROM _bad_trips)
);

-- 3) قيود الدفتر المرتبطة بسداد هذه الطلبات
DELETE FROM "LedgerEntry"
WHERE "refType" = 'DriverPayment' AND "refId" IN (
  SELECT id FROM "DriverPayment" WHERE "tripId" IN (SELECT id FROM _bad_trips)
);

-- 4) قيود الدفتر المرتبطة بالطلبات نفسها (غرامات إلغاء / استلاف من المكتب)
DELETE FROM "LedgerEntry"
WHERE "refType" = 'Trip' AND "refId" IN (SELECT id FROM _bad_trips);

-- 5) قيود الدفتر المرتبطة بسلف مربوطة بهذه الطلبات
DELETE FROM "LedgerEntry"
WHERE "refType" = 'Advance' AND "refId" IN (
  SELECT id FROM "Advance" WHERE "tripId" IN (SELECT id FROM _bad_trips)
);

-- 6) السلف المرتبطة بهذه الطلبات
DELETE FROM "Advance" WHERE "tripId" IN (SELECT id FROM _bad_trips);

-- 7) حذف الطلبات (يمسح تلقائيًا Collection + DriverPayment + TripTransfer بالـ Cascade)
DELETE FROM "Trip" WHERE id IN (SELECT id FROM _bad_trips);

COMMIT;
