-- إضافة عمود "رقم إضافي" للمقاولين والسواقين على قاعدة بيانات موجودة
-- شغّله مرة واحدة في Supabase → SQL Editor

ALTER TABLE "Contractor" ADD COLUMN IF NOT EXISTS "altPhone" TEXT;
ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "altPhone" TEXT;
