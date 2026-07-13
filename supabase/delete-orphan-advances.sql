-- ============================================================
-- حذف السلف/الأرصدة اليتيمة - لا يمكن التراجع. خذ Backup أولا.
-- يمسح أي حركة سلفة/رصيد طرفها اتمسح:
--   • Advance: partyType=CONTRACTOR ومفيش مقاول بالـ id ده، أو
--              partyType=DRIVER ومفيش سواق بالـ id ده.
--   • ExternalAdvance: المستلِف أو المُقرِض اتمسح.
-- ويمسح معاها قيود دفتر الأستاذ المرتبطة → الخزنة والأرباح تترجع كأنها لم تكن.
-- (السلف المربوطة برحلات يتيمة يغطّيها delete-orphan-trips.sql)
-- شغله مرة في Supabase -> SQL Editor.
-- ============================================================

-- اختياري: اعرف العدد قبل الحذف
SELECT
  (SELECT count(*) FROM "Advance" a
   WHERE (a."partyType" = 'CONTRACTOR'
          AND NOT EXISTS (SELECT 1 FROM "Contractor" c WHERE c.id = a."partyId"))
      OR (a."partyType" = 'DRIVER'
          AND NOT EXISTS (SELECT 1 FROM "Driver" d WHERE d.id = a."partyId"))
  ) AS orphan_advances_count,
  (SELECT count(*) FROM "ExternalAdvance" e
   WHERE (e."borrowerType" = 'CONTRACTOR'
          AND NOT EXISTS (SELECT 1 FROM "Contractor" c WHERE c.id = e."borrowerId"))
      OR (e."borrowerType" = 'DRIVER'
          AND NOT EXISTS (SELECT 1 FROM "Driver" d WHERE d.id = e."borrowerId"))
      OR (e."lenderType" = 'CONTRACTOR'
          AND NOT EXISTS (SELECT 1 FROM "Contractor" c WHERE c.id = e."lenderId"))
      OR (e."lenderType" = 'DRIVER'
          AND NOT EXISTS (SELECT 1 FROM "Driver" d WHERE d.id = e."lenderId"))
  ) AS orphan_external_advances_count;

BEGIN;

-- 1) قيود الدفتر المرتبطة بالسلف اليتيمة
DELETE FROM "LedgerEntry"
WHERE "refType" = 'Advance'
  AND "refId" IN (
    SELECT a.id
    FROM "Advance" a
    WHERE (a."partyType" = 'CONTRACTOR'
           AND NOT EXISTS (SELECT 1 FROM "Contractor" c WHERE c.id = a."partyId"))
       OR (a."partyType" = 'DRIVER'
           AND NOT EXISTS (SELECT 1 FROM "Driver" d WHERE d.id = a."partyId"))
  );

-- 2) حذف السلف اليتيمة نفسها
DELETE FROM "Advance" a
WHERE (a."partyType" = 'CONTRACTOR'
       AND NOT EXISTS (SELECT 1 FROM "Contractor" c WHERE c.id = a."partyId"))
   OR (a."partyType" = 'DRIVER'
       AND NOT EXISTS (SELECT 1 FROM "Driver" d WHERE d.id = a."partyId"));

-- 3) حذف السلف الخارجية اليتيمة (المستلِف أو المُقرِض اتمسح)
DELETE FROM "ExternalAdvance" e
WHERE (e."borrowerType" = 'CONTRACTOR'
       AND NOT EXISTS (SELECT 1 FROM "Contractor" c WHERE c.id = e."borrowerId"))
   OR (e."borrowerType" = 'DRIVER'
       AND NOT EXISTS (SELECT 1 FROM "Driver" d WHERE d.id = e."borrowerId"))
   OR (e."lenderType" = 'CONTRACTOR'
       AND NOT EXISTS (SELECT 1 FROM "Contractor" c WHERE c.id = e."lenderId"))
   OR (e."lenderType" = 'DRIVER'
       AND NOT EXISTS (SELECT 1 FROM "Driver" d WHERE d.id = e."lenderId"));

COMMIT;
