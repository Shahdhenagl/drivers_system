"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { recordLedger, assertAvailable } from "@/lib/finance";
import { toPiastres } from "@/lib/money";

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

  if (amount <= 0) throw new Error("القيمة غير صحيحة");

  // سداد السواق التزام — يُمنع فقط لو تجاوز رصيد الخزنة الفعلي (دون قفل رأس المال)
  await assertAvailable(method, amount);

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
    throw new Error("المبلغ أكبر من إجمالي المتبقي للسواق");
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
