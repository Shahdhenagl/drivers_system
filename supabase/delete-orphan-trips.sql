-- ============================================================
-- حذف الطلبات اليتيمة - لا يمكن التراجع. خذ Backup أولا.
-- يمسح أي طلب: ملوش سواق (driverId فارغ / السواق اتمسح)، أو مقاول اتمسح.
-- ويمسح معاه أثره من الإحصائيات:
--   قيود التحصيل + قيود سداد السواق + قيود الطلب + قيود السلف المرتبطة بالطلب.
-- شغله مرة في Supabase -> SQL Editor.
-- ============================================================

-- اختياري: اعرف العدد قبل الحذف
SELECT count(*) AS orphan_trips_count
FROM "Trip" t
WHERE t."driverId" IS NULL
   OR NOT EXISTS (SELECT 1 FROM "Contractor" c WHERE c.id = t."contractorId")
   OR NOT EXISTS (SELECT 1 FROM "Driver" d WHERE d.id = t."driverId");

BEGIN;

-- 1) قيود الدفتر المرتبطة بتحصيلات هذه الطلبات
DELETE FROM "LedgerEntry"
WHERE "refType" = 'Collection'
  AND "refId" IN (
    SELECT c.id
    FROM "Collection" c
    WHERE c."tripId" IN (
      SELECT t.id
      FROM "Trip" t
      WHERE t."driverId" IS NULL
         OR NOT EXISTS (SELECT 1 FROM "Contractor" co WHERE co.id = t."contractorId")
         OR NOT EXISTS (SELECT 1 FROM "Driver" d WHERE d.id = t."driverId")
    )
  );

-- 2) قيود الدفتر المرتبطة بسداد السواق لهذه الطلبات
DELETE FROM "LedgerEntry"
WHERE "refType" = 'DriverPayment'
  AND "refId" IN (
    SELECT p.id
    FROM "DriverPayment" p
    WHERE p."tripId" IN (
      SELECT t.id
      FROM "Trip" t
      WHERE t."driverId" IS NULL
         OR NOT EXISTS (SELECT 1 FROM "Contractor" co WHERE co.id = t."contractorId")
         OR NOT EXISTS (SELECT 1 FROM "Driver" d WHERE d.id = t."driverId")
    )
  );

-- 3) قيود الدفتر المرتبطة بالطلبات نفسها
DELETE FROM "LedgerEntry"
WHERE "refType" = 'Trip'
  AND "refId" IN (
    SELECT t.id
    FROM "Trip" t
    WHERE t."driverId" IS NULL
       OR NOT EXISTS (SELECT 1 FROM "Contractor" co WHERE co.id = t."contractorId")
       OR NOT EXISTS (SELECT 1 FROM "Driver" d WHERE d.id = t."driverId")
  );

-- 4) قيود الدفتر المرتبطة بسلف مربوطة بهذه الطلبات
DELETE FROM "LedgerEntry"
WHERE "refType" = 'Advance'
  AND "refId" IN (
    SELECT a.id
    FROM "Advance" a
    WHERE a."tripId" IN (
      SELECT t.id
      FROM "Trip" t
      WHERE t."driverId" IS NULL
         OR NOT EXISTS (SELECT 1 FROM "Contractor" co WHERE co.id = t."contractorId")
         OR NOT EXISTS (SELECT 1 FROM "Driver" d WHERE d.id = t."driverId")
    )
  );

-- 5) السلف المرتبطة بهذه الطلبات
DELETE FROM "Advance"
WHERE "tripId" IN (
  SELECT t.id
  FROM "Trip" t
  WHERE t."driverId" IS NULL
     OR NOT EXISTS (SELECT 1 FROM "Contractor" co WHERE co.id = t."contractorId")
     OR NOT EXISTS (SELECT 1 FROM "Driver" d WHERE d.id = t."driverId")
);

-- 6) حذف الطلبات نفسها
-- Collection + DriverPayment + TripTransfer يتم حذفهم تلقائيا لو علاقات Cascade موجودة.
DELETE FROM "Trip"
WHERE id IN (
  SELECT t.id
  FROM "Trip" t
  WHERE t."driverId" IS NULL
     OR NOT EXISTS (SELECT 1 FROM "Contractor" co WHERE co.id = t."contractorId")
     OR NOT EXISTS (SELECT 1 FROM "Driver" d WHERE d.id = t."driverId")
);

COMMIT;

