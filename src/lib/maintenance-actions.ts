"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { COLLECTORS, collectorMethodValue } from "@/lib/constants";

// سلفة "زيادة تحصيل" مربوطة برصيد مقاول (لا تقابلها تحصيلات) — تُستثنى من المطابقة
const ADV_LEG_MARKER = "[c:adv:";

/**
 * مطابقة أرصدة المحصّلين مع تحصيلاتهم الفعلية — على مستوى كل محصّل (لا بالتاريخ):
 * القاعدة: مجموع سلف "المحصّل يمسك الفلوس" لازم يساوي مجموع التحصيلات المسجّلة
 * بطريقته. أي فرق يضخّم رأس المال أو ينقصه.
 *
 * - سلف زيادة عن التحصيلات (تحصيلاتها محذوفة) → تُزال من الأقدم.
 * - تحصيلات بلا سلفة كافية (السلفة اتحذفت بالغلط) → يُعاد الرصيد الناقص كسلفة واحدة.
 *
 * بعد التشغيل يتساوى الطرفان لكل محصّل فيرجع رأس المال صحيحًا. آمن ومتكرر.
 */
export async function repairOrphanCollectorHoldings(): Promise<{
  collectorsFixed: number;
  removedHoldings: number;
  addedHoldings: number;
}> {
  let collectorsFixed = 0;
  let removedHoldings = 0;
  let addedHoldings = 0;

  for (const name of COLLECTORS) {
    const method = collectorMethodValue(name);
    const driver = await prisma.driver.findFirst({
      where: { name },
      select: { id: true },
    });
    if (!driver) continue;

    const outAdvances = await prisma.advance.findMany({
      where: {
        partyType: "DRIVER",
        partyId: driver.id,
        method,
        direction: "OUT",
      },
      orderBy: { date: "asc" },
    });
    // نستثني سلف "زيادة التحصيل" المربوطة برصيد مقاول (لا يقابلها تحصيل)
    const backing = outAdvances.filter(
      (a) => !(a.note ?? "").includes(ADV_LEG_MARKER)
    );
    const outSum = backing.reduce((s, a) => s + a.amount, 0);

    const cols = await prisma.collection.aggregate({
      where: { method },
      _sum: { amount: true },
    });
    const colSum = cols._sum.amount ?? 0;

    if (outSum === colSum) continue;

    if (outSum > colSum) {
      // سلف محصّل زائدة عن تحصيلاتها الفعلية — نزيل الفائض من الأقدم
      let excess = outSum - colSum;
      for (const a of backing) {
        if (excess <= 0) break;
        if (a.amount <= excess) {
          await prisma.advance.delete({ where: { id: a.id } });
          excess -= a.amount;
        } else {
          await prisma.advance.update({
            where: { id: a.id },
            data: { amount: a.amount - excess },
          });
          excess = 0;
        }
      }
      removedHoldings += outSum - colSum;
    } else {
      // تحصيلات بلا سلفة كافية — نعيد الرصيد الناقص كسلفة واحدة على المحصّل
      const missing = colSum - outSum;
      await prisma.advance.create({
        data: {
          partyType: "DRIVER",
          partyId: driver.id,
          amount: missing,
          direction: "OUT",
          method,
          note: "تسوية رصيد المحصّل — مطابقة مع التحصيلات",
          date: new Date(),
        },
      });
      addedHoldings += missing;
    }
    collectorsFixed += 1;
  }

  if (collectorsFixed > 0) {
    await audit("REPAIR", "Advance", "collector-holdings", {
      collectorsFixed,
      removedHoldings,
      addedHoldings,
    });
    revalidatePath("/finance");
    revalidatePath("/drivers");
    revalidatePath("/contractors");
    revalidatePath("/");
  }

  return { collectorsFixed, removedHoldings, addedHoldings };
}
