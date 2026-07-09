"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { effectiveAmounts, deriveCollectionStatus } from "@/lib/finance";
import { advanceBalance } from "@/lib/advance-actions";
import { OFFSET } from "@/lib/constants";

/**
 * مقاصّة/تصفية حساب طرف: يقاصّ اللي له مع اللي عليه (بدون أي كاش)، فيصفّر
 * المتساوي ويبقيه كسجل. للسواق: متبقي رحلاته (له) مقابل سلفه الخارجية (عليه)
 * + سلف المكتب. للمقاول: آجل رحلاته (عليه) مقابل سلفه الخارجية (له) + رصيد المكتب.
 */
export async function offsetAccount(
  partyType: "DRIVER" | "CONTRACTOR",
  partyId: string
) {
  const advBal = await advanceBalance(partyType, partyId);

  if (partyType === "DRIVER") {
    const trips = await prisma.trip.findMany({
      where: { driverId: partyId, status: { not: "CANCELLED" } },
      orderBy: { date: "asc" },
      include: { driverPayments: true },
    });
    const tripItems = trips
      .map((t) => {
        const paid = t.driverPayments.reduce((s, p) => s + p.amount, 0);
        return { trip: t, rem: Math.max(effectiveAmounts(t).driver - paid, 0) };
      })
      .filter((x) => x.rem > 0);
    const tripRemaining = tripItems.reduce((s, x) => s + x.rem, 0); // له
    // ما عليه: سلف خارجية مستلِف + سلف مكتب عليه
    const externals = await prisma.externalAdvance
      .findMany({
        where: { status: { not: "SETTLED" }, borrowerType: "DRIVER", borrowerId: partyId },
        orderBy: { date: "asc" },
      })
      .catch(() => []);
    const officeDebt = Math.max(advBal, 0);
    if (tripRemaining <= 0) return { error: "لا يوجد مستحق للسواق للمقاصّة" };
    if (externals.length === 0 && officeDebt <= 0)
      return { error: "لا يوجد ما يُقاصّ (لا سلف عليه)" };

    let applied = 0;
    await prisma.$transaction(async (tx) => {
      let budget = tripRemaining;
      for (const e of externals) {
        if (e.amount <= budget) {
          await tx.externalAdvance.update({
            where: { id: e.id },
            data: { status: "SETTLED", settledAt: new Date() },
          });
          budget -= e.amount;
          applied += e.amount;
        }
      }
      const officeOffset = Math.min(officeDebt, budget);
      if (officeOffset > 0) {
        await tx.advance.create({
          data: {
            partyType: "DRIVER",
            partyId,
            amount: officeOffset,
            direction: "IN",
            method: OFFSET,
            note: "مقاصّة حساب",
          },
        });
        budget -= officeOffset;
        applied += officeOffset;
      }
      // خصم المطبَّق من مستحقات الرحلات بقيود سداد بدون كاش
      let left = applied;
      for (const it of tripItems) {
        if (left <= 0) break;
        const pay = Math.min(it.rem, left);
        left -= pay;
        await tx.driverPayment.create({
          data: {
            tripId: it.trip.id,
            driverId: partyId,
            amount: pay,
            method: OFFSET,
            note: "مقاصّة حساب",
          },
        });
      }
    });
    if (applied <= 0)
      return { error: "لا يوجد ما يُقاصّ (قيم السلف أكبر من المستحق)" };
    await audit("OFFSET_ACCOUNT", "Driver", partyId, { applied });
    revalidatePath(`/drivers/${partyId}`);
    revalidatePath("/drivers");
    revalidatePath("/finance");
    return;
  }

  // ===== مقاول: آجل رحلاته (عليه) مقابل سلفه الخارجية (له) + رصيد المكتب له =====
  const trips = await prisma.trip.findMany({
    where: { contractorId: partyId },
    orderBy: { date: "asc" },
    include: { collections: true },
  });
  const tripItems = trips
    .map((t) => {
      const eff = effectiveAmounts(t).contractor;
      const collected = t.collections.reduce((s, x) => s + x.amount, 0);
      return { trip: t, eff, collected, rem: Math.max(eff - collected, 0) };
    })
    .filter((x) => x.rem > 0);
  const deferred = tripItems.reduce((s, x) => s + x.rem, 0); // عليه
  const externals = await prisma.externalAdvance
    .findMany({
      where: { status: { not: "SETTLED" }, lenderType: "CONTRACTOR", lenderId: partyId },
      orderBy: { date: "asc" },
    })
    .catch(() => []);
  const officeCredit = Math.max(-advBal, 0); // له
  if (deferred <= 0) return { error: "لا يوجد آجل على المقاول للمقاصّة" };
  if (externals.length === 0 && officeCredit <= 0)
    return { error: "لا يوجد ما يُقاصّ (لا مستحقات له)" };

  let applied = 0;
  await prisma.$transaction(async (tx) => {
    let budget = deferred;
    for (const e of externals) {
      if (e.amount <= budget) {
        await tx.externalAdvance.update({
          where: { id: e.id },
          data: { status: "SETTLED", settledAt: new Date() },
        });
        budget -= e.amount;
        applied += e.amount;
      }
    }
    const officeOffset = Math.min(officeCredit, budget);
    if (officeOffset > 0) {
      await tx.advance.create({
        data: {
          partyType: "CONTRACTOR",
          partyId,
          amount: officeOffset,
          direction: "OUT",
          method: OFFSET,
          note: "مقاصّة حساب",
        },
      });
      budget -= officeOffset;
      applied += officeOffset;
    }
    // خصم المطبَّق من آجل الرحلات بقيود تحصيل بدون كاش
    let left = applied;
    for (const it of tripItems) {
      if (left <= 0) break;
      const pay = Math.min(it.rem, left);
      left -= pay;
      await tx.collection.create({
        data: { tripId: it.trip.id, amount: pay, method: OFFSET, note: "مقاصّة حساب" },
      });
      await tx.trip.update({
        where: { id: it.trip.id },
        data: {
          collectionStatus: deriveCollectionStatus(it.eff, it.collected + pay),
        },
      });
    }
  });
  if (applied <= 0) return { error: "لا يوجد ما يُقاصّ (قيم السلف أكبر من الآجل)" };
  await audit("OFFSET_ACCOUNT", "Contractor", partyId, { applied });
  revalidatePath(`/contractors/${partyId}`);
  revalidatePath("/contractors");
  revalidatePath("/finance");
}

/**
 * بدء حساب جديد (أرشفة كشف الحساب): تصفير العرض فقط — تُخفي الحركات القديمة من
 * الكشف الجاري وتبدأ من صفر. البيانات كلها تبقى محفوظة في قاعدة البيانات،
 * فالربح والتقارير تظل صحيحة وشغّالة. تُستخدم بعد المقاصّة لما يتساوى له وعليه.
 */
export async function startNewStatement(
  partyType: "DRIVER" | "CONTRACTOR",
  partyId: string
) {
  const now = new Date();
  try {
    if (partyType === "DRIVER") {
      await prisma.driver.update({
        where: { id: partyId },
        data: { statementClearedAt: now },
      });
      revalidatePath(`/drivers/${partyId}`);
      revalidatePath("/drivers");
    } else {
      await prisma.contractor.update({
        where: { id: partyId },
        data: { statementClearedAt: now },
      });
      revalidatePath(`/contractors/${partyId}`);
      revalidatePath("/contractors");
    }
  } catch {
    return { error: "تعذّر بدء حساب جديد — تأكد من تحديث قاعدة البيانات" };
  }
  await audit(
    "CLEAR_STATEMENT",
    partyType === "DRIVER" ? "Driver" : "Contractor",
    partyId
  );
  revalidatePath("/shared");
}
