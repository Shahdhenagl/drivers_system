-- ⚠️ تصفير كل البيانات — لا يمكن التراجع
-- يمسح كل السجلات من كل الجداول ويُبقي الجداول نفسها فارغة.
-- شغّله يدويًا في Supabase → SQL Editor عند الحاجة فقط.

TRUNCATE TABLE
  "LedgerEntry",
  "AuditLog",
  "Collection",
  "DriverPayment",
  "PartnerWithdrawal",
  "Settlement",
  "Advance",
  "Expense",
  "Trip",
  "Driver",
  "Contractor",
  "Partner",
  "Setting"
RESTART IDENTITY CASCADE;
