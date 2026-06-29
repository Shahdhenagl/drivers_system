import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const initialCapitalEgp = Number(process.env.INITIAL_CAPITAL ?? "200000");
  const initialCapital = Math.round(initialCapitalEgp * 100); // قروش

  // رأس المال كإعداد
  await prisma.setting.upsert({
    where: { key: "initial_capital" },
    update: {},
    create: { key: "initial_capital", value: String(initialCapital) },
  });

  // قيد رأس المال في دفتر الأستاذ (يدخل الخزنة كاش) — مرة واحدة فقط
  const existingCapital = await prisma.ledgerEntry.findFirst({
    where: { type: "CAPITAL" },
  });
  if (!existingCapital) {
    await prisma.ledgerEntry.create({
      data: {
        type: "CAPITAL",
        direction: "IN",
        amount: initialCapital,
        method: "cash",
        description: "رأس المال الابتدائي",
      },
    });
    console.log(`✓ تم تسجيل رأس المال: ${initialCapitalEgp.toLocaleString()} ج.م`);
  } else {
    console.log("• رأس المال مسجّل مسبقًا — تم التخطي");
  }

  console.log("✓ اكتملت البذور");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
