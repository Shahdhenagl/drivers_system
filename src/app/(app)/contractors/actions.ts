"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import {
  recordLedger,
  effectiveAmounts,
  deriveCollectionStatus,
} from "@/lib/finance";
import {
  resolveCollector,
  collectorAdvanceMarker,
  type Collector,
} from "@/lib/collectors";
import { advanceBalance } from "@/lib/advance-actions";
import {
  openBorrowerLegs,
  openLenderLegs,
  owedByBorrower,
  owedToLender,
  advanceLeg,
} from "@/lib/external-legs";
import { OFFSET } from "@/lib/constants";
import { wipeParty } from "@/lib/party-wipe";
import { toPiastres } from "@/lib/money";

export async function createContractor(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name || !phone) return;

  const c = await prisma.contractor.create({
    data: {
      name,
      phone,
      altPhone: String(formData.get("altPhone") ?? "").trim() || null,
      phone3: String(formData.get("phone3") ?? "").trim() || null,
      company: String(formData.get("company") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });
  await audit("CREATE", "Contractor", c.id, { name });
  revalidatePath("/contractors");
}

export async function updateContractor(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name || !phone) return;

  await prisma.contractor.update({
    where: { id },
    data: {
      name,
      phone,
      altPhone: String(formData.get("altPhone") ?? "").trim() || null,
      phone3: String(formData.get("phone3") ?? "").trim() || null,
      company: String(formData.get("company") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });
  await audit("UPDATE", "Contractor", id);
  revalidatePath("/contractors");
  revalidatePath(`/contractors/${id}`);
}

/**
 * تحصيل مجمّع من المقاول — يقفل الحساب كله بضغطة واحدة:
 *  1) مقاصّة بدون كاش: اللي له (رصيد مكتب + سلف خارجية له) مقابل اللي عليه
 *     (آجل الرحلات + سلف خارجية عليه).
 *  2) الكاش المُدخَل يوزَّع بالأقدم أولًا: آجل الرحلات ← سلف خارجية عليه.
 *     (فلوس السلفة الخارجية تدخل الخزنة كأمانة حتى تُسلَّم للمُقرِض.)
 *  3) أي زيادة تُسجَّل رصيدًا للمقاول (له عندنا) فتُطفئ سلف المكتب عليه.
 */
export async function collectAllFromContractor(
  contractorId: string,
  formData: FormData
) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  const note = String(formData.get("note") ?? "").trim() || "تحصيل مجمّع";
  if (amount < 0) return { error: "اكتب قيمة صحيحة" };

  const [trips, externals, advBal] = await Promise.all([
    prisma.trip.findMany({
      where: { contractorId },
      orderBy: { date: "asc" },
      include: { collections: true },
    }),
    prisma.externalAdvance
      .findMany({
        where: {
          OR: [
            { borrowerType: "CONTRACTOR", borrowerId: contractorId },
            { lenderType: "CONTRACTOR", lenderId: contractorId },
          ],
        },
        orderBy: { date: "asc" },
      })
      .catch(() => []),
    advanceBalance("CONTRACTOR", contractorId),
  ]);

  // الرحلات المستحقة مرتّبة بالأقدم
  type Item = {
    trip: (typeof trips)[number];
    eff: number;
    collected: number;
    remaining: number;
  };
  const items: Item[] = [];
  for (const t of trips) {
    const eff = effectiveAmounts(t).contractor;
    const collected = t.collections.reduce((s, x) => s + x.amount, 0);
    const remaining = Math.max(eff - collected, 0);
    if (remaining > 0) items.push({ trip: t, eff, collected, remaining });
  }

  // لو التحصيل "عن طريق محصّل": كل المبلغ يبقى معاه (سلفة عليه) ولا يدخل الخزنة
  const collectorRaw = await resolveCollector(method);
  if (collectorRaw && "notFound" in collectorRaw) {
    return { error: `المحصّل «${collectorRaw.notFound}» غير موجود في السواقين` };
  }
  const collector: Collector | null = collectorRaw;
  // اسم المقاول يُحفظ على سلفة المحصّل عشان كشف حسابه يقول حصّل من مين
  const contractorName = collector
    ? (
        await prisma.contractor.findUnique({
          where: { id: contractorId },
          select: { name: true },
        })
      )?.name ?? null
    : null;

  // ساقات السلف الخارجية المفتوحة — عليه (مستلِف) وله (مُقرِض)، الأقدم أولًا
  const borrowerLegs = openBorrowerLegs(externals, "CONTRACTOR", contractorId);
  const lenderLegs = openLenderLegs(externals, "CONTRACTOR", contractorId);
  const officeCredit = Math.max(-advBal, 0); // رصيد المكتب له

  await prisma.$transaction(async (tx) => {
    // متبقّيات محلّية تتحدّث عبر المرحلتين (مقاصّة ثم كاش)
    const tripRem = new Map(items.map((it) => [it.trip.id, it.remaining]));
    const tripPaid = new Map(items.map((it) => [it.trip.id, 0]));
    const borrowerRem = new Map(
      borrowerLegs.map((l) => [l.id, owedByBorrower(l)])
    );
    const lenderRem = new Map(lenderLegs.map((l) => [l.id, owedToLender(l)]));

    /** تحصيل على رحلة: قيد تحصيل + تحديث حالة التحصيل (+ خزنة/محصّل لو كاش) */
    async function collectTrip(
      it: Item,
      pay: number,
      payMethod: string,
      payNote: string,
      cash: boolean
    ) {
      const col = await tx.collection.create({
        data: { tripId: it.trip.id, amount: pay, method: payMethod, date, note: payNote },
      });
      if (cash && collector) {
        // المحصّل يمسك حصّة هذه الرحلة — سلفة عليه مربوطة بالتحصيل (بدون قيد خزنة).
        // الربط بعلامة col يضمن حذفها تلقائيًا مع حذف/تعديل التحصيل من أي مكان.
        await tx.advance.create({
          data: {
            partyType: "DRIVER",
            partyId: collector.id,
            amount: pay,
            direction: "OUT",
            method: payMethod,
            note: `تحصيل عن طريق ${collector.name} ${collectorAdvanceMarker("col", col.id)}`,
            tripId: it.trip.id,
            sourceType: "CONTRACTOR",
            sourceId: contractorId,
            sourceName: contractorName,
            date,
          },
        });
      } else if (cash) {
        await recordLedger(tx, {
          type: "COLLECTION",
          direction: "IN",
          amount: pay,
          method: payMethod,
          description: `تحصيل — رحلة ${it.trip.startPoint} ← ${it.trip.endPoint}`,
          refType: "Collection",
          refId: col.id,
          date,
        });
      }
      const paidSoFar = (tripPaid.get(it.trip.id) ?? 0) + pay;
      tripPaid.set(it.trip.id, paidSoFar);
      tripRem.set(it.trip.id, Math.max((tripRem.get(it.trip.id) ?? 0) - pay, 0));
      await tx.trip.update({
        where: { id: it.trip.id },
        data: {
          collectionStatus: deriveCollectionStatus(it.eff, it.collected + paidSoFar),
        },
      });
    }

    /** تحصيل ساق المستلِف من سلفة خارجية — الكاش يدخل الخزنة كأمانة */
    async function collectBorrowerLeg(
      leg: (typeof borrowerLegs)[number],
      pay: number,
      payMethod: string,
      cash: boolean
    ) {
      await advanceLeg(tx, leg.id, "collected", pay);
      borrowerRem.set(leg.id, Math.max((borrowerRem.get(leg.id) ?? 0) - pay, 0));
      if (cash && collector) {
        await tx.advance.create({
          data: {
            partyType: "DRIVER",
            partyId: collector.id,
            amount: pay,
            direction: "OUT",
            method: payMethod,
            note: `تحصيل سلفة خارجية عن طريق ${collector.name} ${collectorAdvanceMarker("ext", leg.id)}`,
            sourceType: "CONTRACTOR",
            sourceId: contractorId,
            sourceName: contractorName,
            date,
          },
        });
      } else if (cash) {
        await recordLedger(tx, {
          type: "EXTERNAL_HOLD_IN",
          direction: "IN",
          amount: pay,
          method: payMethod,
          description: `تحصيل سلفة خارجية (أمانة) — ${leg.lenderName}`,
          refType: "ExternalAdvance",
          refId: leg.id,
          date,
        });
      }
    }

    // ===== 1) مقاصّة بدون كاش: اللي له (سلف خارجية له + رصيد مكتب) مقابل اللي عليه =====
    const totalDebit =
      [...tripRem.values()].reduce((a, b) => a + b, 0) +
      [...borrowerRem.values()].reduce((a, b) => a + b, 0);
    const totalCredit =
      officeCredit + [...lenderRem.values()].reduce((a, b) => a + b, 0);
    const offset = Math.min(totalDebit, totalCredit);

    if (offset > 0) {
      // جهة «عليه»: الرحلات الأقدم ثم ساقات المستلِف
      let leftDebit = offset;
      for (const it of items) {
        if (leftDebit <= 0) break;
        const rem = tripRem.get(it.trip.id) ?? 0;
        if (rem <= 0) continue;
        const pay = Math.min(rem, leftDebit);
        leftDebit -= pay;
        await collectTrip(it, pay, OFFSET, "مقاصّة حساب", false);
      }
      for (const leg of borrowerLegs) {
        if (leftDebit <= 0) break;
        const rem = borrowerRem.get(leg.id) ?? 0;
        if (rem <= 0) continue;
        const pay = Math.min(rem, leftDebit);
        leftDebit -= pay;
        await collectBorrowerLeg(leg, pay, OFFSET, false);
      }

      // جهة «له»: ساقات المُقرِض الأقدم ثم رصيد المكتب
      let leftCredit = offset;
      for (const leg of lenderLegs) {
        if (leftCredit <= 0) break;
        const rem = lenderRem.get(leg.id) ?? 0;
        if (rem <= 0) continue;
        const give = Math.min(rem, leftCredit);
        leftCredit -= give;
        await advanceLeg(tx, leg.id, "paid", give);
        lenderRem.set(leg.id, rem - give);
      }
      if (leftCredit > 0) {
        // إطفاء رصيد المكتب له بقيد صرف بدون خزنة
        await tx.advance.create({
          data: {
            partyType: "CONTRACTOR",
            partyId: contractorId,
            amount: leftCredit,
            direction: "OUT",
            method: OFFSET,
            note: "مقاصّة حساب",
            date,
          },
        });
      }
    }

    // ===== 2) الكاش المُدخَل: آجل الرحلات ← سلف خارجية عليه ← الزيادة رصيد له =====
    let left = amount;
    for (const it of items) {
      if (left <= 0) break;
      const rem = tripRem.get(it.trip.id) ?? 0;
      if (rem <= 0) continue;
      const pay = Math.min(rem, left);
      left -= pay;
      await collectTrip(it, pay, method, note, true);
    }
    for (const leg of borrowerLegs) {
      if (left <= 0) break;
      const rem = borrowerRem.get(leg.id) ?? 0;
      if (rem <= 0) continue;
      const pay = Math.min(rem, left);
      left -= pay;
      await collectBorrowerLeg(leg, pay, method, true);
    }

    // الزيادة عن المستحق → رصيد للمقاول (له عندنا) — تُطفئ سلف المكتب عليه
    if (left > 0) {
      const adv = await tx.advance.create({
        data: {
          partyType: "CONTRACTOR",
          partyId: contractorId,
          amount: left,
          direction: "IN",
          method,
          note: "رصيد (زيادة عن المستحق في التحصيل)",
          date,
        },
      });
      if (collector) {
        // المحصّل يمسك الزيادة أيضًا — سلفة عليه مربوطة برصيد المقاول (بدون قيد خزنة)
        await tx.advance.create({
          data: {
            partyType: "DRIVER",
            partyId: collector.id,
            amount: left,
            direction: "OUT",
            method,
            note: `زيادة تحصيل عن طريق ${collector.name} ${collectorAdvanceMarker("adv", adv.id)}`,
            sourceType: "CONTRACTOR",
            sourceId: contractorId,
            sourceName: contractorName,
            date,
          },
        });
      } else {
        await recordLedger(tx, {
          type: "ADVANCE_IN",
          direction: "IN",
          amount: left,
          method,
          description: "رصيد مقاول (زيادة عن المستحق)",
          refType: "Advance",
          refId: adv.id,
          date,
        });
      }
    }
  });

  await audit("COLLECT_ALL", "Contractor", contractorId, { amount, method });
  revalidatePath(`/contractors/${contractorId}`);
  revalidatePath("/contractors");
  revalidatePath("/finance");
  revalidatePath("/");
}

/** علامة المراجعة اليومية: reviewed=true يسجّل الآن، false يمسحها */
export async function setContractorReviewed(id: string, reviewed: boolean) {
  await prisma.contractor.update({
    where: { id },
    data: { lastReviewedAt: reviewed ? new Date() : null },
  });
  revalidatePath(`/contractors/${id}`);
}

/**
 * حذف المقاول = مسح كل أثره المالي تلقائيًا (رحلاته وتحصيلاتها وسداداتها وسلفه
 * وسلفه الخارجية وقيود الدفتر)، وتُعكَس الخزنة والأرباح كأنه لم يوجد.
 */
export async function deleteContractor(id: string) {
  await prisma.$transaction(async (tx) => {
    await wipeParty(tx, "CONTRACTOR", id);
    await tx.contractor.delete({ where: { id } });
  });
  await audit("DELETE", "Contractor", id);
  revalidatePath("/contractors");
  revalidatePath("/drivers");
  revalidatePath("/finance");
  revalidatePath("/");
  redirect("/contractors");
}
