-- ============================================================
-- حذف قيود دفتر الأستاذ "المعلّقة" - لا يمكن التراجع. خذ Backup أولا.
-- القيد المعلّق = بيشير لسجل اتمسح (Advance/Collection/DriverPayment/Trip)،
-- أو سلفة طرفها (سواق/مقاول) اتحذف. بعد الحذف ترجع الخزنة والأرباح صح.
-- (المصروفات Expense وسحوبات الشركاء PartnerWithdrawal مستثناة — مصدرها مستقل.)
-- للعرض قبل الحذف: شغّل find-orphan-ledger.sql أولا.
-- شغّله مرة في Supabase -> SQL Editor.
-- ============================================================

-- اختياري: العدد قبل الحذف
SELECT count(*) AS orphan_ledger_count
FROM "LedgerEntry" le
WHERE
  (le."refType" = 'Advance' AND (
     NOT EXISTS (SELECT 1 FROM "Advance" a WHERE a.id = le."refId")
     OR EXISTS (
       SELECT 1 FROM "Advance" a WHERE a.id = le."refId" AND (
         (a."partyType" = 'CONTRACTOR' AND NOT EXISTS (SELECT 1 FROM "Contractor" c WHERE c.id = a."partyId"))
         OR (a."partyType" = 'DRIVER' AND NOT EXISTS (SELECT 1 FROM "Driver" d WHERE d.id = a."partyId"))
       ))
  ))
  OR (le."refType" = 'Collection'
      AND NOT EXISTS (SELECT 1 FROM "Collection" c WHERE c.id = le."refId"))
  OR (le."refType" = 'DriverPayment'
      AND NOT EXISTS (SELECT 1 FROM "DriverPayment" p WHERE p.id = le."refId"))
  OR (le."refType" = 'Trip'
      AND NOT EXISTS (SELECT 1 FROM "Trip" t WHERE t.id = le."refId"));

BEGIN;

DELETE FROM "LedgerEntry" le
WHERE
  (le."refType" = 'Advance' AND (
     NOT EXISTS (SELECT 1 FROM "Advance" a WHERE a.id = le."refId")
     OR EXISTS (
       SELECT 1 FROM "Advance" a WHERE a.id = le."refId" AND (
         (a."partyType" = 'CONTRACTOR' AND NOT EXISTS (SELECT 1 FROM "Contractor" c WHERE c.id = a."partyId"))
         OR (a."partyType" = 'DRIVER' AND NOT EXISTS (SELECT 1 FROM "Driver" d WHERE d.id = a."partyId"))
       ))
  ))
  OR (le."refType" = 'Collection'
      AND NOT EXISTS (SELECT 1 FROM "Collection" c WHERE c.id = le."refId"))
  OR (le."refType" = 'DriverPayment'
      AND NOT EXISTS (SELECT 1 FROM "DriverPayment" p WHERE p.id = le."refId"))
  OR (le."refType" = 'Trip'
      AND NOT EXISTS (SELECT 1 FROM "Trip" t WHERE t.id = le."refId"));

COMMIT;
