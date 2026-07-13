-- ============================================================
-- عرض (SELECT فقط — لا يحذف) قيود دفتر الأستاذ "المعلّقة":
-- القيد المعلّق = بيشير لسجل اتمسح، أو سجل طرفه (سواق/مقاول) اتحذف.
-- دي القيود اللي لسه بتأثّر على الخزنة والأرباح رغم إن مصدرها راح.
-- شغّله في Supabase -> SQL Editor. آمن تمامًا — قراءة فقط.
-- (مصروفات Expense وسحوبات الشركاء PartnerWithdrawal مستثناة: ليها مصدر مستقل.)
-- ============================================================

-- (أ) ملخّص بالعدد والمبلغ حسب السبب
SELECT reason, count(*) AS entries, sum(amount) AS total_piastres
FROM (
  SELECT le.amount,
    CASE
      WHEN le."refType" = 'Advance'
           AND NOT EXISTS (SELECT 1 FROM "Advance" a WHERE a.id = le."refId")
        THEN 'سلفة اتمسحت (القيد فضل معلّق)'
      WHEN le."refType" = 'Advance'
           AND EXISTS (
             SELECT 1 FROM "Advance" a WHERE a.id = le."refId" AND (
               (a."partyType" = 'CONTRACTOR' AND NOT EXISTS (SELECT 1 FROM "Contractor" c WHERE c.id = a."partyId"))
               OR (a."partyType" = 'DRIVER' AND NOT EXISTS (SELECT 1 FROM "Driver" d WHERE d.id = a."partyId"))
             ))
        THEN 'سلفة طرفها اتحذف'
      WHEN le."refType" = 'Collection'
           AND NOT EXISTS (SELECT 1 FROM "Collection" c WHERE c.id = le."refId")
        THEN 'تحصيل اتمسح (القيد فضل معلّق)'
      WHEN le."refType" = 'DriverPayment'
           AND NOT EXISTS (SELECT 1 FROM "DriverPayment" p WHERE p.id = le."refId")
        THEN 'سداد سواق اتمسح (القيد فضل معلّق)'
      WHEN le."refType" = 'Trip'
           AND NOT EXISTS (SELECT 1 FROM "Trip" t WHERE t.id = le."refId")
        THEN 'رحلة اتمسحت (القيد فضل معلّق)'
      ELSE NULL
    END AS reason
  FROM "LedgerEntry" le
) x
WHERE reason IS NOT NULL
GROUP BY reason
ORDER BY entries DESC;

-- (ب) التفاصيل: كل قيد معلّق بمفرده
SELECT le.id, le.type, le.direction, le.amount, le.method,
       le.description, le."refType", le."refId", le.date
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
      AND NOT EXISTS (SELECT 1 FROM "Trip" t WHERE t.id = le."refId"))
ORDER BY le.date DESC;
