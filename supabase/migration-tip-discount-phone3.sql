-- إضافة الأعمدة الجديدة على قاعدة بيانات موجودة
-- شغّله مرة واحدة في Supabase → SQL Editor

-- اكرامية للسواق وخصم على العميل (بالقروش)
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "driverTip" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "customerDiscount" INTEGER NOT NULL DEFAULT 0;

-- رقم إضافي ثالث للمقاولين والسواقين
ALTER TABLE "Contractor" ADD COLUMN IF NOT EXISTS "phone3" TEXT;
ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "phone3" TEXT;
