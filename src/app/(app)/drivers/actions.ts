"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { recordLedger, planSpend, effectiveAmounts } from "@/lib/finance";
import { advanceBalance } from "@/lib/advance-actions";
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

export async function deleteDriver(id: string) {
  const payCount = await prisma.driverPayment.count({ where: { driverId: id } });
  if (payCount > 0) {
    return {
      error:
        "لا يمكن حذف هذا السواق لوجود سداد مسجّل له. تظل سجلاته محفوظة.",
    };
  }
  // فك ارتباطه عن أي رحلات ثم حذفه (تبقى الرحلات بدون سواق)
  await prisma.$transaction(async (tx) => {
    await tx.trip.updateMany({ where: { driverId: id }, data: { driverId: null } });
    await tx.driver.delete({ where: { id } });
  });
  await audit("DELETE", "Driver", id);
  revalidatePath("/drivers");
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

  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const trips = await prisma.trip.findMany({
    where: { driverId, status: { not: "CANCELLED" } },
    orderBy: { date: "asc" },
    include: { driverPayments: true },
  });

  // الرحلات المستحقة مرتّبة بالأقدم
  const items: { trip: (typeof trips)[number]; remaining: number }[] = [];
  for (const t of trips) {
    const paid = t.driverPayments.reduce((s, p) => s + p.amount, 0);
    const rem = Math.max(effectiveAmounts(t).driver - paid, 0);
    if (rem > 0) items.push({ trip: t, remaining: rem });
  }

  // منع النزول تحت الصفر (كامل المبلغ يخرج كاش)
  const plan = await planSpend(method, amount, false);
  if (!plan.ok) {
    return { error: plan.error, balances: plan.balances, canFallback: plan.canFallback };
  }

  await prisma.$transaction(async (tx) => {
    let left = amount;
    for (const it of items) {
      if (left <= 0) break;
      const pay = Math.min(it.remaining, left);
      left -= pay;
      const dp = await tx.driverPayment.create({
        data: { tripId: it.trip.id, driverId, amount: pay, method, date, note },
      });
      await recordLedger(tx, {
        type: "DRIVER_PAYMENT",
        direction: "OUT",
        amount: pay,
        method,
        description: `سداد سواق — رحلة ${it.trip.startPoint} ← ${it.trip.endPoint}`,
        refType: "DriverPayment",
        refId: dp.id,
        date,
      });
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
    where: { driverId, status: { not: "CANCELLED" } },
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
