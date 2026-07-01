-- ============================================================
-- ترحيل: جدول الأرصدة/السلف الموحّد للأطراف (Advance) — سواق ومقاول، في الاتجاهين
-- شغّل مرة واحدة في Supabase → SQL Editor. آمن للتكرار.
-- ============================================================
CREATE TABLE IF NOT EXISTS "Advance" (
    "id" TEXT NOT NULL,
    "partyType" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "note" TEXT,
    "isOpening" BOOLEAN NOT NULL DEFAULT false,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Advance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Advance_party_idx" ON "Advance"("partyType", "partyId");

-- ترحيل بيانات سلف السواقين القديمة (DriverAdvance) لو الجدول موجود
DO $$ BEGIN
  INSERT INTO "Advance" ("id","partyType","partyId","amount","direction","method","note","isOpening","date","createdAt")
  SELECT "id", 'DRIVER', "driverId", "amount",
         CASE WHEN "kind" = 'ADVANCE' THEN 'OUT' ELSE 'IN' END,
         "method", "note", false, "date", "createdAt"
  FROM "DriverAdvance"
  ON CONFLICT ("id") DO NOTHING;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
