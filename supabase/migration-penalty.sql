-- تعديل لإضافة أعمدة غرامة الإلغاء على قاعدة بيانات موجودة
-- شغّله مرة واحدة في Supabase → SQL Editor

ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "contractorPenalty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "driverPenalty" INTEGER NOT NULL DEFAULT 0;
