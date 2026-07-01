"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { recordLedger, planSpend } from "@/lib/finance";
import { toPiastres, formatMoney } from "@/lib/money";
import { methodLabel } from "@/lib/constants";
import { sendTelegram } from "@/lib/telegram";
import {
  adminDriverAdvanceMessage,
  adminDriverRepaymentMessage,
} from "@/lib/messages";

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
      vehicleType,
      vehicleNumber: String(formData.get("vehicleNumber") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });
  await audit("UPDATE", "Driver", id);
  revalidatePath("/drivers");
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

/** سداد مستحقات السواق — يوزَّع على الرحلات الأقدم أولًا */
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

  let remainingToPay = amount;
  const totalDue = trips.reduce((a, t) => {
    const paid = t.driverPayments.reduce((s, p) => s + p.amount, 0);
    return a + Math.max(t.driverDue - paid, 0);
  }, 0);

  // قاعدة: لا يُدفع أكثر من المتبقي للسواق
  if (amount > totalDue) {
    return { error: "المبلغ أكبر من إجمالي المتبقي للسواق" };
  }

  // منع النزول تحت الصفر وحفظ رأس المال في الكاش
  const plan = await planSpend(method, amount, false);
  if (!plan.ok) {
    return { error: plan.error, balances: plan.balances, canFallback: plan.canFallback };
  }

  await prisma.$transaction(async (tx) => {
    for (const t of trips) {
      if (remainingToPay <= 0) break;
      const paid = t.driverPayments.reduce((s, p) => s + p.amount, 0);
      const rem = Math.max(t.driverDue - paid, 0);
      if (rem <= 0) continue;
      const pay = Math.min(rem, remainingToPay);
      const dp = await tx.driverPayment.create({
        data: { tripId: t.id, driverId, amount: pay, method, date, note },
      });
      await recordLedger(tx, {
        type: "DRIVER_PAYMENT",
        direction: "OUT",
        amount: pay,
        method,
        description: `سداد سواق — رحلة ${t.startPoint} ← ${t.endPoint}`,
        refType: "DriverPayment",
        refId: dp.id,
        date,
      });
      remainingToPay -= pay;
    }
  });

  await audit("PAY", "Driver", driverId, { amount, method });
  revalidatePath(`/drivers/${driverId}`);
  revalidatePath("/drivers");
  revalidatePath("/finance");
}

/** إجمالي السلف المتبقية على سواق (المصروف − المسدَّد) بالقروش */
async function driverAdvanceOutstanding(driverId: string): Promise<number> {
  const rows = await prisma.driverAdvance.groupBy({
    by: ["kind"],
    where: { driverId },
    _sum: { amount: true },
  });
  let advanced = 0;
  let repaid = 0;
  for (const r of rows) {
    if (r.kind === "ADVANCE") advanced = r._sum.amount ?? 0;
    else if (r.kind === "REPAYMENT") repaid = r._sum.amount ?? 0;
  }
  return advanced - repaid;
}

/** صرف سلفة لسواق — تخرج من الخزنة وتُسجَّل عليه */
export async function addDriverAdvance(driverId: string, formData: FormData) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  const fallback = String(formData.get("fallback") ?? "") === "1";
  const note = String(formData.get("note") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) return { error: "السواق غير موجود" };

  // منع النزول تحت الصفر وحفظ رأس المال (مع إمكان السحب من وسائل أخرى)
  const plan = await planSpend(method, amount, fallback);
  if (!plan.ok) {
    return { error: plan.error, balances: plan.balances, canFallback: plan.canFallback };
  }

  await prisma.$transaction(async (tx) => {
    const adv = await tx.driverAdvance.create({
      data: { driverId, amount, kind: "ADVANCE", method, note, date },
    });
    for (const e of plan.entries) {
      await recordLedger(tx, {
        type: "DRIVER_ADVANCE",
        direction: "OUT",
        amount: e.amount,
        method: e.method,
        description:
          plan.entries.length > 1
            ? `سلفة سواق — ${driver.name} (${methodLabel(e.method)})`
            : `سلفة سواق — ${driver.name}`,
        refType: "DriverAdvance",
        refId: adv.id,
        date,
      });
    }
  });

  await audit("ADVANCE", "Driver", driverId, { amount, method });

  try {
    const outstanding = await driverAdvanceOutstanding(driverId);
    await sendTelegram(
      adminDriverAdvanceMessage({ name: driver.name, amount, method, note, outstanding })
    );
  } catch {
    // تجاهل فشل الإشعار
  }

  revalidatePath(`/drivers/${driverId}`);
  revalidatePath("/drivers");
  revalidatePath("/finance");
}

/** سداد سلفة من سواق — إيراد يدخل الخزنة ويُنقص ما عليه */
export async function repayDriverAdvance(driverId: string, formData: FormData) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  const note = String(formData.get("note") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) return { error: "السواق غير موجود" };

  const outstandingBefore = await driverAdvanceOutstanding(driverId);
  if (outstandingBefore <= 0) return { error: "لا توجد سلف على هذا السواق" };
  if (amount > outstandingBefore) {
    return {
      error: `المبلغ أكبر من السلف المتبقية — المتبقي: ${formatMoney(outstandingBefore)}`,
    };
  }

  await prisma.$transaction(async (tx) => {
    const rep = await tx.driverAdvance.create({
      data: { driverId, amount, kind: "REPAYMENT", method, note, date },
    });
    await recordLedger(tx, {
      type: "DRIVER_ADVANCE_REPAYMENT",
      direction: "IN",
      amount,
      method,
      description: `سداد سلفة سواق — ${driver.name}`,
      refType: "DriverAdvance",
      refId: rep.id,
      date,
    });
  });

  await audit("ADVANCE_REPAY", "Driver", driverId, { amount, method });

  try {
    const outstanding = await driverAdvanceOutstanding(driverId);
    await sendTelegram(
      adminDriverRepaymentMessage({ name: driver.name, amount, method, note, outstanding })
    );
  } catch {
    // تجاهل فشل الإشعار
  }

  revalidatePath(`/drivers/${driverId}`);
  revalidatePath("/drivers");
  revalidatePath("/finance");
}
