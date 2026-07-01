"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { toPiastres } from "@/lib/money";
import {
  recordLedger,
  planSpend,
  deriveCollectionStatus,
  effectiveAmounts,
} from "@/lib/finance";
import { VIA_DRIVER } from "@/lib/constants";
import { sendTelegram } from "@/lib/telegram";
import { adminNewTripMessage } from "@/lib/messages";

/** إنشاء رحلة جديدة — يدعم إضافة مقاول/سواق أثناء الإنشاء */
export async function createTrip(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "").trim();

  // المقاول
  let contractorId = get("contractorId");
  if (contractorId === "__new__" || !contractorId) {
    const name = get("newContractorName");
    const phone = get("newContractorPhone");
    if (!name || !phone) return { error: "اكتب اسم المقاول ورقم موبايله" };
    const c = await prisma.contractor.create({
      data: { name, phone, company: get("newContractorCompany") || null },
    });
    contractorId = c.id;
    await audit("CREATE", "Contractor", c.id, { via: "trip" });
  }

  // السواق (اختياري)
  let driverId: string | null = get("driverId") || null;
  if (driverId === "__new__") {
    const name = get("newDriverName");
    const phone = get("newDriverPhone");
    const vehicleType = get("newDriverVehicleType") || "غير محدد";
    if (!name || !phone) return { error: "اكتب اسم السواق ورقم موبايله" };
    const dr = await prisma.driver.create({
      data: { name, phone, vehicleType },
    });
    driverId = dr.id;
    await audit("CREATE", "Driver", dr.id, { via: "trip" });
  }
  if (driverId === "") driverId = null;

  const dateStr = get("date");
  const trip = await prisma.trip.create({
    data: {
      contractorId,
      driverId,
      date: dateStr ? new Date(dateStr) : new Date(),
      time: get("time") || null,
      startPoint: get("startPoint"),
      endPoint: get("endPoint"),
      description: get("description") || null,
      distance: get("distance") ? Number(get("distance")) : null,
      contractorPrice: toPiastres(get("contractorPrice") || "0"),
      driverDue: toPiastres(get("driverDue") || "0"),
      driverTip: toPiastres(get("driverTip") || "0"),
      customerDiscount: toPiastres(get("customerDiscount") || "0"),
      notes: get("notes") || null,
      status: "NEW",
      collectionStatus: "NONE",
    },
  });
  await audit("CREATE", "Trip", trip.id);

  // إشعار الأدمن بالطلب الجديد عبر تيليجرام (لا يعطّل الإنشاء لو فشل)
  try {
    const full = await prisma.trip.findUnique({
      where: { id: trip.id },
      include: { contractor: true, driver: true },
    });
    if (full) await sendTelegram(adminNewTripMessage(full));
  } catch {
    // تجاهل أي فشل في الإشعار
  }

  revalidatePath("/trips");
  revalidatePath("/");
  redirect(`/trips/${trip.id}`);
}

export async function updateTrip(id: string, formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const dateStr = get("date");
  await prisma.trip.update({
    where: { id },
    data: {
      date: dateStr ? new Date(dateStr) : undefined,
      time: get("time") || null,
      startPoint: get("startPoint"),
      endPoint: get("endPoint"),
      description: get("description") || null,
      distance: get("distance") ? Number(get("distance")) : null,
      contractorPrice: toPiastres(get("contractorPrice") || "0"),
      driverDue: toPiastres(get("driverDue") || "0"),
      driverTip: toPiastres(get("driverTip") || "0"),
      customerDiscount: toPiastres(get("customerDiscount") || "0"),
      driverId: get("driverId") || null,
    },
  });
  await audit("UPDATE", "Trip", id);
  revalidatePath(`/trips/${id}`);
  revalidatePath("/trips");
}

/**
 * إلغاء الطلب — مع اختيار سماح أو غرامة.
 * في حالة الغرامة: العميل يدفع غرامة، السواق يأخذ نصيبًا منها، والباقي إيراد المكتب.
 */
export async function cancelTrip(id: string, formData: FormData) {
  const type = String(formData.get("penaltyType") ?? "NONE");
  const method = String(formData.get("method") ?? "cash");
  let contractorPenalty = 0;
  let driverPenalty = 0;

  if (type === "PENALTY") {
    contractorPenalty = toPiastres(String(formData.get("contractorPenalty") ?? "0"));
    driverPenalty = toPiastres(String(formData.get("driverPenalty") ?? "0"));
    if (contractorPenalty < 0 || driverPenalty < 0) {
      return { error: "قيم الغرامة غير صحيحة" };
    }
    if (driverPenalty > contractorPenalty) {
      return { error: "نصيب السواق لا يمكن أن يتجاوز غرامة العميل" };
    }
  }

  const trip = await prisma.trip.findUnique({
    where: { id },
    include: { collections: true, driverPayments: true },
  });
  if (!trip) return { error: "الرحلة غير موجودة" };
  if (trip.status === "CANCELLED") return { error: "الطلب ملغي بالفعل" };

  const collected = trip.collections.reduce((a, c) => a + c.amount, 0);
  const paid = trip.driverPayments.reduce((a, p) => a + p.amount, 0);
  // غرامة العميل تدخل الخزنة، ونصيب السواق يخرج منها (بعد خصم ما سبق تحصيله/دفعه)
  const penaltyToCollect = Math.max(contractorPenalty - collected, 0);
  const penaltyToPayDriver = Math.max(driverPenalty - paid, 0);

  await prisma.$transaction(async (tx) => {
    if (penaltyToCollect > 0) {
      const col = await tx.collection.create({
        data: { tripId: id, amount: penaltyToCollect, method, note: "غرامة إلغاء" },
      });
      await recordLedger(tx, {
        type: "COLLECTION",
        direction: "IN",
        amount: penaltyToCollect,
        method,
        description: `غرامة إلغاء — رحلة ${trip.startPoint} ← ${trip.endPoint}`,
        refType: "Collection",
        refId: col.id,
      });
    }
    if (penaltyToPayDriver > 0 && trip.driverId) {
      const dp = await tx.driverPayment.create({
        data: {
          tripId: id,
          driverId: trip.driverId,
          amount: penaltyToPayDriver,
          method,
          note: "نصيب غرامة إلغاء",
        },
      });
      await recordLedger(tx, {
        type: "DRIVER_PAYMENT",
        direction: "OUT",
        amount: penaltyToPayDriver,
        method,
        description: `نصيب سواق من غرامة إلغاء — رحلة ${trip.startPoint} ← ${trip.endPoint}`,
        refType: "DriverPayment",
        refId: dp.id,
      });
    }
    await tx.trip.update({
      where: { id },
      data: {
        status: "CANCELLED",
        contractorPenalty,
        driverPenalty,
        collectionStatus: deriveCollectionStatus(
          contractorPenalty,
          collected + penaltyToCollect
        ),
      },
    });
  });

  await audit("CANCEL", "Trip", id, { type, contractorPenalty, driverPenalty });
  revalidatePath(`/trips/${id}`);
  revalidatePath("/trips");
  revalidatePath("/finance");
  revalidatePath("/");
}

/** حذف الطلب — مسموح فقط إذا لم يتم تحصيل أي مبلغ من المقاول */
export async function deleteTrip(id: string) {
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: { collections: true, driverPayments: true },
  });
  if (!trip) return;

  // قاعدة: لو تم التحصيل (ولو جزئيًا) يفضل محفوظًا ولا يُحذف
  if (trip.collections.length > 0) {
    return {
      error: "تم التحصيل على هذه الرحلة — لا يمكن حذفها، تظل محفوظة.",
    };
  }

  await prisma.$transaction(async (tx) => {
    // عكس أي سداد للسواق من دفتر الأستاذ (يرجع للخزنة) قبل الحذف
    const dpIds = trip.driverPayments.map((p) => p.id);
    if (dpIds.length > 0) {
      await tx.ledgerEntry.deleteMany({
        where: { refType: "DriverPayment", refId: { in: dpIds } },
      });
    }
    // حذف الرحلة (يحذف تلقائيًا الدفعات المرتبطة عبر Cascade)
    await tx.trip.delete({ where: { id } });
  });

  await audit("DELETE", "Trip", id);
  revalidatePath("/trips");
  revalidatePath("/finance");
  revalidatePath("/");
  redirect("/trips");
}

/** تغيير حالة الرحلة */
export async function setTripStatus(id: string, status: string) {
  const current = await prisma.trip.findUnique({
    where: { id },
    select: { status: true, driverId: true },
  });
  if (!current) return { error: "الرحلة غير موجودة" };
  // الطلب الملغي مقفول — لا تغيير للحالة
  if (current.status === "CANCELLED") {
    return { error: "الطلب ملغي — لا يمكن إجراء أي عملية عليه" };
  }
  // قاعدة: لا يمكن إنهاء الرحلة بدون اختيار سواق
  if (status === "COMPLETED" && !current.driverId) {
    return { error: "لا يمكن إنهاء الرحلة بدون اختيار سواق" };
  }
  await prisma.trip.update({ where: { id }, data: { status } });
  await audit("STATUS", "Trip", id, { status });
  revalidatePath(`/trips/${id}`);
  revalidatePath("/trips");
  revalidatePath("/");
}

export async function addNote(id: string, formData: FormData) {
  const current = await prisma.trip.findUnique({
    where: { id },
    select: { status: true },
  });
  if (current?.status === "CANCELLED") {
    return { error: "الطلب ملغي — لا يمكن إجراء أي عملية عليه" };
  }
  const note = String(formData.get("note") ?? "").trim();
  await prisma.trip.update({ where: { id }, data: { notes: note || null } });
  await audit("NOTE", "Trip", id);
  revalidatePath(`/trips/${id}`);
}

/** تحصيل دفعة من المقاول */
export async function addCollection(tripId: string, formData: FormData) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { collections: true },
  });
  if (!trip) return { error: "الرحلة غير موجودة" };
  if (trip.status === "CANCELLED") {
    return { error: "الطلب ملغي — لا يمكن التحصيل عليه" };
  }

  const eff = effectiveAmounts(trip);
  const collected = trip.collections.reduce((a, c) => a + c.amount, 0);
  // قاعدة: لا يمكن تحصيل مبلغ أكبر من قيمة الرحلة (أو الغرامة عند الإلغاء)
  if (collected + amount > eff.contractor) {
    return { error: "المبلغ يتجاوز قيمة الرحلة المتبقية" };
  }

  await prisma.$transaction(async (tx) => {
    const col = await tx.collection.create({
      data: { tripId, amount, method, date, note },
    });
    await recordLedger(tx, {
      type: "COLLECTION",
      direction: "IN",
      amount,
      method,
      description: `تحصيل — رحلة ${trip.startPoint} ← ${trip.endPoint}`,
      refType: "Collection",
      refId: col.id,
      date,
    });
    const newStatus = deriveCollectionStatus(eff.contractor, collected + amount);
    await tx.trip.update({
      where: { id: tripId },
      data: { collectionStatus: newStatus },
    });
  });

  await audit("COLLECT", "Trip", tripId, { amount, method });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  revalidatePath("/finance");
  revalidatePath("/");
}

/**
 * تحصيل عن طريق السواق:
 * المقاول يسلّم السواق مبلغًا مباشرة.
 * - يُخصم من مديونية المقاول (يُسجَّل كتحصيل)
 * - يُخصم من مستحق السواق لنفس الطلب (يُسجَّل كسداد)
 * - لا يؤثر على الخزنة (لا توجد قيود في دفتر الأستاذ — المال لم يمرّ بالمكتب)
 */
export async function collectViaDriver(tripId: string, formData: FormData) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  const extra = String(formData.get("note") ?? "").trim();
  const note = extra ? `عن طريق السواق — ${extra}` : "تحصيل عن طريق السواق";
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { collections: true, driverPayments: true },
  });
  if (!trip) return { error: "الرحلة غير موجودة" };
  if (trip.status === "CANCELLED") {
    return { error: "الطلب ملغي — لا يمكن إجراء أي عملية عليه" };
  }
  if (!trip.driverId) return { error: "لا يوجد سواق على الرحلة" };

  const eff = effectiveAmounts(trip);
  const collected = trip.collections.reduce((a, c) => a + c.amount, 0);
  const remainingCollection = eff.contractor - collected;
  const paid = trip.driverPayments.reduce((a, p) => a + p.amount, 0);
  const remainingDriver = eff.driver - paid;

  if (amount > remainingCollection) {
    return { error: "المبلغ أكبر من المتبقي على المقاول" };
  }
  if (amount > remainingDriver) {
    return { error: "المبلغ أكبر من مستحق السواق المتبقي لهذا الطلب" };
  }

  await prisma.$transaction(async (tx) => {
    // تحصيل من المقاول (بطريقة خاصة لا تدخل الخزنة)
    await tx.collection.create({
      data: { tripId, amount, method: VIA_DRIVER, date, note },
    });
    // خصم من مستحق السواق (بنفس الطريقة الخاصة)
    await tx.driverPayment.create({
      data: { tripId, driverId: trip.driverId!, amount, method: VIA_DRIVER, date, note },
    });
    // تحديث حالة التحصيل
    const newStatus = deriveCollectionStatus(eff.contractor, collected + amount);
    await tx.trip.update({
      where: { id: tripId },
      data: { collectionStatus: newStatus },
    });
  });

  await audit("COLLECT_VIA_DRIVER", "Trip", tripId, { amount });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  revalidatePath("/finance");
  revalidatePath("/");
}

/** سداد دفعة لمستحق السواق من شاشة الرحلة */
export async function addDriverPayment(tripId: string, formData: FormData) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { driverPayments: true },
  });
  if (!trip) return { error: "الرحلة غير موجودة" };
  if (trip.status === "CANCELLED") {
    return { error: "الطلب ملغي — لا يمكن إجراء أي عملية عليه" };
  }
  if (!trip.driverId) return { error: "لا يوجد سواق على الرحلة" };

  const paidEff = effectiveAmounts(trip);
  const paid = trip.driverPayments.reduce((a, p) => a + p.amount, 0);
  // قاعدة: لا يمكن دفع أكثر من المتبقي
  if (paid + amount > paidEff.driver) {
    return { error: "المبلغ يتجاوز مستحق السواق المتبقي" };
  }

  // منع النزول تحت الصفر وحفظ رأس المال في الكاش
  const plan = await planSpend(method, amount, false);
  if (!plan.ok) {
    return { error: plan.error, balances: plan.balances, canFallback: plan.canFallback };
  }

  await prisma.$transaction(async (tx) => {
    const dp = await tx.driverPayment.create({
      data: { tripId, driverId: trip.driverId!, amount, method, date, note },
    });
    await recordLedger(tx, {
      type: "DRIVER_PAYMENT",
      direction: "OUT",
      amount,
      method,
      description: `سداد سواق — رحلة ${trip.startPoint} ← ${trip.endPoint}`,
      refType: "DriverPayment",
      refId: dp.id,
      date,
    });
  });

  await audit("DRIVER_PAY", "Trip", tripId, { amount, method });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  revalidatePath("/finance");
  revalidatePath("/");
}
