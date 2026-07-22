"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { recordLedger, planSpend, effectiveAmounts } from "@/lib/finance";
import { advanceBalance } from "@/lib/advance-actions";
import { resolveCollector, type Collector } from "@/lib/collectors";
import {
  openBorrowerLegs,
  openLenderLegs,
  owedByBorrower,
  owedToLender,
  advanceLeg,
} from "@/lib/external-legs";
import { wipeParty } from "@/lib/party-wipe";
import { toPiastres } from "@/lib/money";
import { OFFSET } from "@/lib/constants";

export async function createDriver(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const vehicleType = String(formData.get("vehicleType") ?? "").trim();
  if (!name || !phone || !vehicleType) return;

  const d = await prisma.driver.create({
    data: {
      name,
      phone,
      altPhone: String(formData.get("altPhone") ?? "").trim() || null,
      phone3: String(formData.get("phone3") ?? "").trim() || null,
      vehicleType,
      vehicleNumber: String(formData.get("vehicleNumber") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });
  await audit("CREATE", "Driver", d.id, { name });
  revalidatePath("/drivers");
}

export async function updateDriver(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const vehicleType = String(formData.get("vehicleType") ?? "").trim();
  if (!name || !phone || !vehicleType) return;

  await prisma.driver.update({
    where: { id },
    data: {
      name,
      phone,
      altPhone: String(formData.get("altPhone") ?? "").trim() || null,
      phone3: String(formData.get("phone3") ?? "").trim() || null,
      vehicleType,
      vehicleNumber: String(formData.get("vehicleNumber") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });
  await audit("UPDATE", "Driver", id);
  revalidatePath("/drivers");
  revalidatePath(`/drivers/${id}`);
}

/** علامة المراجعة اليومية: reviewed=true يسجّل الآن، false يمسحها */
export async function setDriverReviewed(id: string, reviewed: boolean) {
  await prisma.driver.update({
    where: { id },
    data: { lastReviewedAt: reviewed ? new Date() : null },
  });
  revalidatePath(`/drivers/${id}`);
}

/**
 * حذف السواق = مسح كل أثره المالي تلقائيًا (رحلاته وتحصيلاتها وسداداتها وسلفه
 * وسلفه الخارجية وقيود الدفتر)، وتُعكَس الخزنة والأرباح كأنه لم يوجد.
 */
export async function deleteDriver(id: string) {
  await prisma.$transaction(async (tx) => {
    await wipeParty(tx, "DRIVER", id);
    await tx.driver.delete({ where: { id } });
  });
  await audit("DELETE", "Driver", id);
  revalidatePath("/drivers");
  revalidatePath("/contractors");
  revalidatePath("/finance");
  revalidatePath("/");
  redirect("/drivers");
}

/**
 * سداد مستحقات السواق — يوزَّع بالأقدم أولًا على الرحلات المستحقة.
 * أي زيادة عن المستحق تُسجَّل سلفة على السواق (يدين بها لنا).
 */
export async function payDriverDues(driverId: string, formData: FormData) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  const note = String(formData.get("note") ?? "").trim() || null;

  if (amount < 0) return { error: "اكتب قيمة صحيحة" };

  const [trips, externals, advBal] = await Promise.all([
    prisma.trip.findMany({
      where: { driverId },
      orderBy: { date: "asc" },
      include: { driverPayments: true },
    }),
    prisma.externalAdvance
      .findMany({
        where: {
          OR: [
            { borrowerType: "DRIVER", borrowerId: driverId },
            { lenderType: "DRIVER", lenderId: driverId },
          ],
        },
        orderBy: { date: "asc" },
      })
      .catch(() => []),
    advanceBalance("DRIVER", driverId),
  ]);

  // الرحلات المستحقة مرتّبة بالأقدم
  const items: { trip: (typeof trips)[number]; remaining: number }[] = [];
  for (const t of trips) {
    const paid = t.driverPayments.reduce((s, p) => s + p.amount, 0);
    const rem = Math.max(effectiveAmounts(t).driver - paid, 0);
    if (rem > 0) items.push({ trip: t, remaining: rem });
  }

  // لو السداد "عن طريق محصّل": الفلوس تُدفع من اللي معاه — يقلّ رصيده، ولا تمسّ الخزنة
  const collectorRaw = await resolveCollector(method);
  if (collectorRaw && "notFound" in collectorRaw) {
    return { error: `المحصّل «${collectorRaw.notFound}» غير موجود في السواقين` };
  }
  const collector: Collector | null = collectorRaw;
  // اسم السواق يُحفظ على سلفة المحصّل عشان كشف حسابه يقول سلّم لمين
  const driverName = collector
    ? (
        await prisma.driver.findUnique({
          where: { id: driverId },
          select: { name: true },
        })
      )?.name ?? null
    : null;

  // منع النزول تحت الصفر (كامل المبلغ يخرج كاش) — لا يلزم لو عن طريق محصّل
  if (!collector && amount > 0) {
    const plan = await planSpend(method, amount, false);
    if (!plan.ok) {
      return { error: plan.error, balances: plan.balances, canFallback: plan.canFallback };
    }
  }

  // ساقات السلف الخارجية المفتوحة — له (مُقرِض) وعليه (مستلِف)، الأقدم أولًا
  const lenderLegs = openLenderLegs(externals, "DRIVER", driverId);
  const borrowerLegs = openBorrowerLegs(externals, "DRIVER", driverId);
  const officeDebt = Math.max(advBal, 0); // سلف المكتب عليه

  await prisma.$transaction(async (tx) => {
    const tripRem = new Map(items.map((it) => [it.trip.id, it.remaining]));
    const lenderRem = new Map(lenderLegs.map((l) => [l.id, owedToLender(l)]));
    const borrowerRem = new Map(
      borrowerLegs.map((l) => [l.id, owedByBorrower(l)])
    );

    /** سداد على رحلة (+ خزنة لو كاش) */
    async function payTrip(
      it: (typeof items)[number],
      pay: number,
      payMethod: string,
      payNote: string | null,
      cash: boolean
    ) {
      const dp = await tx.driverPayment.create({
        data: { tripId: it.trip.id, driverId, amount: pay, method: payMethod, date, note: payNote },
      });
      if (cash && !collector) {
        await recordLedger(tx, {
          type: "DRIVER_PAYMENT",
          direction: "OUT",
          amount: pay,
          method: payMethod,
          description: `سداد سواق — رحلة ${it.trip.startPoint} ← ${it.trip.endPoint}`,
          refType: "DriverPayment",
          refId: dp.id,
          date,
        });
      }
      tripRem.set(it.trip.id, Math.max((tripRem.get(it.trip.id) ?? 0) - pay, 0));
    }

    /** تسليم ساق المُقرِض من سلفة خارجية — الكاش يخرج من الأمانة المحتجزة */
    async function payLenderLeg(
      leg: (typeof lenderLegs)[number],
      pay: number,
      payMethod: string,
      cash: boolean
    ) {
      await advanceLeg(tx, leg.id, "paid", pay);
      lenderRem.set(leg.id, Math.max((lenderRem.get(leg.id) ?? 0) - pay, 0));
      if (cash && !collector) {
        await recordLedger(tx, {
          type: "EXTERNAL_HOLD_OUT",
          direction: "OUT",
          amount: pay,
          method: payMethod,
          description: `تسليم سلفة خارجية — من ${leg.borrowerName}`,
          refType: "ExternalAdvance",
          refId: leg.id,
          date,
        });
      }
    }

    // ===== 1) مقاصّة بدون كاش: اللي له (رحلات + سلف خارجية له) مقابل اللي عليه =====
    const totalCredit =
      [...tripRem.values()].reduce((a, b) => a + b, 0) +
      [...lenderRem.values()].reduce((a, b) => a + b, 0);
    const totalDebit =
      officeDebt + [...borrowerRem.values()].reduce((a, b) => a + b, 0);
    const offset = Math.min(totalCredit, totalDebit);

    if (offset > 0) {
      // جهة «له»: الرحلات الأقدم ثم ساقات المُقرِض
      let leftCredit = offset;
      for (const it of items) {
        if (leftCredit <= 0) break;
        const rem = tripRem.get(it.trip.id) ?? 0;
        if (rem <= 0) continue;
        const pay = Math.min(rem, leftCredit);
        leftCredit -= pay;
        await payTrip(it, pay, OFFSET, "مقاصّة حساب", false);
      }
      for (const leg of lenderLegs) {
        if (leftCredit <= 0) break;
        const rem = lenderRem.get(leg.id) ?? 0;
        if (rem <= 0) continue;
        const pay = Math.min(rem, leftCredit);
        leftCredit -= pay;
        await payLenderLeg(leg, pay, OFFSET, false);
      }

      // جهة «عليه»: ساقات المستلِف الأقدم ثم سلف المكتب
      let leftDebit = offset;
      for (const leg of borrowerLegs) {
        if (leftDebit <= 0) break;
        const rem = borrowerRem.get(leg.id) ?? 0;
        if (rem <= 0) continue;
        const take = Math.min(rem, leftDebit);
        leftDebit -= take;
        await advanceLeg(tx, leg.id, "collected", take);
        borrowerRem.set(leg.id, rem - take);
      }
      if (leftDebit > 0) {
        // إطفاء سلف المكتب عليه بقيد استلام بدون خزنة
        await tx.advance.create({
          data: {
            partyType: "DRIVER",
            partyId: driverId,
            amount: leftDebit,
            direction: "IN",
            method: OFFSET,
            note: "مقاصّة حساب",
            date,
          },
        });
      }
    }

    // ===== 2) الكاش المُسلَّم: مستحق الرحلات ← سلف خارجية له ← الزيادة سلفة عليه =====
    let left = amount;
    for (const it of items) {
      if (left <= 0) break;
      const rem = tripRem.get(it.trip.id) ?? 0;
      if (rem <= 0) continue;
      const pay = Math.min(rem, left);
      left -= pay;
      await payTrip(it, pay, method, note, true);
    }
    for (const leg of lenderLegs) {
      if (left <= 0) break;
      const rem = lenderRem.get(leg.id) ?? 0;
      if (rem <= 0) continue;
      const pay = Math.min(rem, left);
      left -= pay;
      await payLenderLeg(leg, pay, method, true);
    }

    // الزيادة عن المستحق → سلفة على السواق
    if (left > 0) {
      const adv = await tx.advance.create({
        data: {
          partyType: "DRIVER",
          partyId: driverId,
          amount: left,
          direction: "OUT",
          method,
          note: note ?? "سلفة (زيادة عن المستحق)",
          date,
        },
      });
      if (!collector) {
        await recordLedger(tx, {
          type: "ADVANCE_OUT",
          direction: "OUT",
          amount: left,
          method,
          description: "سلفة سواق (زيادة عن المستحق)",
          refType: "Advance",
          refId: adv.id,
          date,
        });
      }
    }

    // المحصّل دفع كل المبلغ من الأمانة اللي معاه — يقلّ ما يمسكه للمكتب
    if (collector && amount > 0) {
      await tx.advance.create({
        data: {
          partyType: "DRIVER",
          partyId: collector.id,
          amount,
          direction: "IN",
          method,
          note: `سداد سواق عن طريق ${collector.name}`,
          sourceType: "DRIVER",
          sourceId: driverId,
          sourceName: driverName,
          date,
        },
      });
    }
  });

  await audit("PAY", "Driver", driverId, { amount, method });
  revalidatePath(`/drivers/${driverId}`);
  revalidatePath("/drivers");
  revalidatePath("/finance");
}

/**
 * مقاصّة: خصم سلفة السواق من مستحقاته (بدون نقدية).
 * يقلّل مستحقاته وسلفته بنفس المبلغ = min(المستحق، السلفة).
 */
export async function offsetDriverAdvance(driverId: string) {
  const trips = await prisma.trip.findMany({
    where: { driverId },
    orderBy: { date: "asc" },
    include: { driverPayments: true },
  });
  const totalDue = trips.reduce((a, t) => {
    const paid = t.driverPayments.reduce((s, p) => s + p.amount, 0);
    return a + Math.max(effectiveAmounts(t).driver - paid, 0);
  }, 0);
  if (totalDue <= 0) return { error: "لا توجد مستحقات للسواق" };

  const debt = await advanceBalance("DRIVER", driverId); // موجب = عليه سلفة لنا
  if (debt <= 0) return { error: "لا توجد سلفة على السواق" };

  const offset = Math.min(totalDue, debt);

  await prisma.$transaction(async (tx) => {
    // خصم من المستحقات (بدون خزنة)
    let left = offset;
    for (const t of trips) {
      if (left <= 0) break;
      const paid = t.driverPayments.reduce((s, p) => s + p.amount, 0);
      const rem = Math.max(effectiveAmounts(t).driver - paid, 0);
      if (rem <= 0) continue;
      const pay = Math.min(rem, left);
      left -= pay;
      await tx.driverPayment.create({
        data: {
          tripId: t.id,
          driverId,
          amount: pay,
          method: OFFSET,
          note: "خصم من السلفة",
        },
      });
    }
    // خفض السلفة (استلام) بنفس المبلغ بدون خزنة
    await tx.advance.create({
      data: {
        partyType: "DRIVER",
        partyId: driverId,
        amount: offset,
        direction: "IN",
        method: OFFSET,
        note: "سداد سلفة من مستحقاته",
      },
    });
  });

  await audit("OFFSET", "Driver", driverId, { offset });
  revalidatePath(`/drivers/${driverId}`);
  revalidatePath("/drivers");
  revalidatePath("/finance");
}
