"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { toPiastres, formatMoney } from "@/lib/money";
import {
  recordLedger,
  planSpend,
  deriveCollectionStatus,
  effectiveAmounts,
} from "@/lib/finance";
import { VIA_DRIVER, methodLabel } from "@/lib/constants";
import { sendTelegram } from "@/lib/telegram";
import { adminExternalAdvanceMessage, adminNewTripMessage } from "@/lib/messages";
import { formatWeekday } from "@/lib/format";

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

  // السواق (إجباري)
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
  if (!driverId) return { error: "اختر السواق" };

  const dateStr = get("date");
  const tripDate = dateStr ? new Date(dateStr) : new Date();
  const trip = await prisma.trip.create({
    data: {
      contractorId,
      driverId,
      date: tripDate,
      time: formatWeekday(tripDate),
      startPoint: get("startPoint"),
      endPoint: get("endPoint"),
      description: get("description") || null,
      distance: get("distance") ? Number(get("distance")) : null,
      contractorPrice: toPiastres(get("contractorPrice") || "0"),
      driverDue: toPiastres(get("driverDue") || "0"),
      driverTip: toPiastres(get("driverTip") || "0"),
      customerDiscount: toPiastres(get("customerDiscount") || "0"),
      contractorSurcharge: toPiastres(get("contractorSurcharge") || "0"),
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

/**
 * إنشاء حجز متعدد الأيام: كل يوم رحلة مستقلة (بتاريخها وسواقها وأسعارها)
 * لكن مرتبطة بنفس groupId. تُحسب مستحقات كل سواق وأرباح المكتب لكل يوم عاديًا.
 */
export async function createMultiDayTrip(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "").trim();

  // المقاول (موجود أو جديد)
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

  const startPoint = get("startPoint");
  const endPoint = get("endPoint");
  const description = get("description") || null;
  const notes = get("notes") || null;
  if (!startPoint || !endPoint)
    return { error: "اكتب نقطة البداية والنهاية" };

  type Day = {
    date: string;
    driverId: string;
    contractorPrice: string;
    driverDue: string;
  };
  let days: Day[] = [];
  try {
    days = JSON.parse(get("days") || "[]");
  } catch {
    return { error: "بيانات الأيام غير صحيحة" };
  }
  if (!Array.isArray(days) || days.length === 0)
    return { error: "أضف يومًا واحدًا على الأقل" };
  for (const d of days) {
    if (!d.date) return { error: "اختر تاريخ كل يوم" };
    if (!d.driverId) return { error: "اختر سواق لكل يوم" };
  }

  const groupId = crypto.randomUUID();
  await prisma.$transaction(async (tx) => {
    for (const d of days) {
      const dt = new Date(d.date);
      await tx.trip.create({
        data: {
          contractorId,
          driverId: d.driverId,
          date: dt,
          time: formatWeekday(dt),
          startPoint,
          endPoint,
          description,
          notes,
          contractorPrice: toPiastres(d.contractorPrice || "0"),
          driverDue: toPiastres(d.driverDue || "0"),
          status: "NEW",
          collectionStatus: "NONE",
          groupId,
        },
      });
    }
  });
  await audit("CREATE", "Trip", groupId, { multiDay: days.length });

  // إشعار الأدمن بملخص الحجز (لا يعطّل الإنشاء لو فشل)
  try {
    const contractor = await prisma.contractor.findUnique({
      where: { id: contractorId },
      select: { name: true },
    });
    const totalContractor = days.reduce(
      (a, d) => a + toPiastres(d.contractorPrice || "0"),
      0
    );
    const totalDriver = days.reduce(
      (a, d) => a + toPiastres(d.driverDue || "0"),
      0
    );
    await sendTelegram(
      [
        `🆕 <b>حجز متعدد الأيام (${days.length} أيام)</b>`,
        `👤 المقاول: ${contractor?.name ?? ""}`,
        `📍 ${startPoint} ← ${endPoint}`,
        `💰 إجمالي المقاول: ${formatMoney(totalContractor)}`,
        `💵 إجمالي السواقين: ${formatMoney(totalDriver)}`,
        `📈 الربح: ${formatMoney(totalContractor - totalDriver)}`,
      ].join("\n")
    );
  } catch {
    // تجاهل أي فشل في الإشعار
  }

  revalidatePath("/trips");
  revalidatePath("/");
  redirect(`/trips/group/${groupId}`);
}

export async function updateTrip(id: string, formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const dateStr = get("date");
  const tripDate = dateStr ? new Date(dateStr) : null;
  await prisma.trip.update({
    where: { id },
    data: {
      date: tripDate ?? undefined,
      time: tripDate ? formatWeekday(tripDate) : get("time") || null,
      startPoint: get("startPoint"),
      endPoint: get("endPoint"),
      description: get("description") || null,
      distance: get("distance") ? Number(get("distance")) : null,
      contractorPrice: toPiastres(get("contractorPrice") || "0"),
      driverDue: toPiastres(get("driverDue") || "0"),
      driverTip: toPiastres(get("driverTip") || "0"),
      customerDiscount: toPiastres(get("customerDiscount") || "0"),
      contractorSurcharge: toPiastres(get("contractorSurcharge") || "0"),
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
    include: { collections: true, driverPayments: true, contractor: true, driver: true },
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
    include: { collections: true, driverPayments: true, contractor: true, driver: true },
  });
  if (!trip) return { error: "الرحلة غير موجودة" };
  if (trip.status === "CANCELLED") {
    return { error: "الطلب ملغي — لا يمكن إجراء أي عملية عليه" };
  }
  if (!trip.driverId) return { error: "لا يوجد سواق على الرحلة" };

  const eff = effectiveAmounts(trip);
  const collected = trip.collections.reduce((a, c) => a + c.amount, 0);
  const remainingCollection = Math.max(eff.contractor - collected, 0);
  const paid = trip.driverPayments.reduce((a, p) => a + p.amount, 0);
  const remainingDriver = Math.max(eff.driver - paid, 0);

  if (remainingCollection <= 0) {
    return { error: "لا يوجد متبقٍّ على المقاول" };
  }
  // القدر المُسوّى: يُحصَّل من المقاول ويُسدَّد للسواق بنفس القيمة (أقل المتبقيين)
  const settle = Math.min(amount, remainingCollection, remainingDriver);
  const driverPayAmount = settle;
  const collectAmount = settle;
  // الزيادة التي سلّمها المقاول للسواق فوق التسوية = سلفة خارجية على السواق للمقاول
  const externalDebt = Math.max(amount - settle, 0);
  const externalRows: {
    borrowerName: string;
    borrowerType: string;
    lenderName: string;
    lenderType: string;
    amount: number;
    date: Date;
    note: string | null;
    settledAt: Date | null;
  }[] = [];

  await prisma.$transaction(async (tx) => {
    // تحصيل من المقاول (بطريقة خاصة لا تدخل الخزنة) — بقدر التسوية فقط
    const col = await tx.collection.create({
      data: { tripId, amount: collectAmount, method: VIA_DRIVER, date, note },
    });
    const marker = viaDriverMarker(col.id);
    const markedNote = `${note} ${marker}`;
    await tx.collection.update({
      where: { id: col.id },
      data: { note: markedNote },
    });
    // خصم من مستحق السواق (بنفس الطريقة الخاصة)
    if (driverPayAmount > 0) {
      await tx.driverPayment.create({
        data: {
          tripId,
          driverId: trip.driverId!,
          amount: driverPayAmount,
          method: VIA_DRIVER,
          date,
          note: markedNote,
        },
      });
    }
    if (externalDebt > 0 && trip.driver) {
      const row = await tx.externalAdvance.create({
        data: {
          borrowerType: "DRIVER",
          borrowerId: trip.driverId!,
          borrowerName: trip.driver.name,
          lenderType: "CONTRACTOR",
          lenderId: trip.contractorId,
          lenderName: trip.contractor.name,
          amount: externalDebt,
          date,
          note: `زيادة تحصيل عن طريق السواق لرحلة ${trip.startPoint} ← ${trip.endPoint} ${marker}`,
        },
      });
      externalRows.push(row);
    }
    // تحديث حالة التحصيل
    const newStatus = deriveCollectionStatus(eff.contractor, collected + collectAmount);
    await tx.trip.update({
      where: { id: tripId },
      data: { collectionStatus: newStatus },
    });
  });

  await audit("COLLECT_VIA_DRIVER", "Trip", tripId, { amount, externalDebt });
  const createdExternalRow = externalRows[0];
  if (createdExternalRow) {
    try {
      await sendTelegram(
        adminExternalAdvanceMessage({
          action: "CREATE",
          borrowerName: createdExternalRow.borrowerName,
          borrowerType: createdExternalRow.borrowerType,
          lenderName: createdExternalRow.lenderName,
          lenderType: createdExternalRow.lenderType,
          amount: createdExternalRow.amount,
          date: createdExternalRow.date,
          note: createdExternalRow.note,
          settledAt: createdExternalRow.settledAt,
        })
      );
    } catch {
      // تجاهل فشل إشعار البوت
    }
  }
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  revalidatePath(`/drivers/${trip.driverId}`);
  revalidatePath(`/contractors/${trip.contractorId}`);
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
  // المبلغ يغطّي مستحق الرحلة أولًا، وأي زيادة تُسجَّل كسلفة على السواق
  const rem = Math.max(paidEff.driver - paid, 0);
  const payToTrip = Math.min(amount, rem);
  const advancePortion = amount - payToTrip;

  // منع النزول تحت الصفر وحفظ رأس المال في الكاش (كامل المبلغ يخرج كاش)
  const plan = await planSpend(method, amount, false);
  if (!plan.ok) {
    return { error: plan.error, balances: plan.balances, canFallback: plan.canFallback };
  }

  await prisma.$transaction(async (tx) => {
    if (payToTrip > 0) {
      const dp = await tx.driverPayment.create({
        data: { tripId, driverId: trip.driverId!, amount: payToTrip, method, date, note },
      });
      await recordLedger(tx, {
        type: "DRIVER_PAYMENT",
        direction: "OUT",
        amount: payToTrip,
        method,
        description: `سداد سواق — رحلة ${trip.startPoint} ← ${trip.endPoint}`,
        refType: "DriverPayment",
        refId: dp.id,
        date,
      });
    }
    // الزيادة عن مستحق الرحلة → سلفة على السواق
    if (advancePortion > 0) {
      const adv = await tx.advance.create({
        data: {
          partyType: "DRIVER",
          partyId: trip.driverId!,
          amount: advancePortion,
          direction: "OUT",
          method,
          note: note ?? "سلفة (زيادة عن مستحق الرحلة)",
          date,
        },
      });
      await recordLedger(tx, {
        type: "ADVANCE_OUT",
        direction: "OUT",
        amount: advancePortion,
        method,
        description: "سلفة سواق (زيادة عن مستحق الرحلة)",
        refType: "Advance",
        refId: adv.id,
        date,
      });
    }
  });

  await audit("DRIVER_PAY", "Trip", tripId, { amount, method, advancePortion });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  revalidatePath("/finance");
  revalidatePath("/");
}

/**
 * تحويل: المقاول يستلف من السواق.
 * السواق يقرض المقاول مبلغًا: يزيد سعر المقاول ويزيد مستحق السواق بنفس القيمة.
 * الربح لا يتغيّر (الطرفان يزيدان بالتساوي). لا يؤثر على الخزنة.
 */
export async function contractorBorrowFromDriver(
  tripId: string,
  formData: FormData
) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { collections: true },
  });
  if (!trip) return { error: "الرحلة غير موجودة" };
  if (trip.status === "CANCELLED")
    return { error: "الطلب ملغي — لا يمكن إجراء أي عملية عليه" };
  if (!trip.driverId) return { error: "لا يوجد سواق على الرحلة" };

  const collected = trip.collections.reduce((a, c) => a + c.amount, 0);
  const newEffContractor =
    trip.contractorPrice + amount - trip.customerDiscount;

  await prisma.$transaction(async (tx) => {
    await tx.trip.update({
      where: { id: tripId },
      data: {
        contractorPrice: { increment: amount },
        driverDue: { increment: amount },
        collectionStatus: deriveCollectionStatus(newEffContractor, collected),
      },
    });
    await tx.tripTransfer.create({
      data: { tripId, type: "CONTRACTOR_FROM_DRIVER", amount, date, note },
    });
  });

  await audit("TRIP_TRANSFER", "Trip", tripId, {
    type: "CONTRACTOR_FROM_DRIVER",
    amount,
  });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  revalidatePath("/finance");
  revalidatePath("/");
}

/**
 * تحويل: المقاول يستلف من المكتب (سلفة تُردّ — لا تزيد الربح).
 * كاش يخرج من الخزنة، ويُسجَّل كسلفة على المقاول (يدين للمكتب) مربوطة بالرحلة.
 * لا يمسّ سعر المقاول ولا الربح — تُسدَّد لاحقًا من صفحة المقاول.
 */
export async function contractorBorrowFromOffice(
  tripId: string,
  formData: FormData
) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  const fallback = String(formData.get("fallback") ?? "") === "1";
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { contractor: true },
  });
  if (!trip) return { error: "الرحلة غير موجودة" };
  if (trip.status === "CANCELLED")
    return { error: "الطلب ملغي — لا يمكن إجراء أي عملية عليه" };

  const plan = await planSpend(method, amount, fallback);
  if (!plan.ok) {
    return { error: plan.error, balances: plan.balances, canFallback: plan.canFallback };
  }

  await prisma.$transaction(async (tx) => {
    const adv = await tx.advance.create({
      data: {
        partyType: "CONTRACTOR",
        partyId: trip.contractorId,
        amount,
        direction: "OUT",
        method,
        note: note ?? `سلفة على رحلة ${trip.startPoint} ← ${trip.endPoint}`,
        tripId,
        date,
      },
    });
    for (const e of plan.entries) {
      await recordLedger(tx, {
        type: "ADVANCE_OUT",
        direction: "OUT",
        amount: e.amount,
        method: e.method,
        description:
          `المقاول استلف من المكتب — ${trip.contractor.name}` +
          (plan.entries.length > 1 ? ` (${methodLabel(e.method)})` : ""),
        refType: "Advance",
        refId: adv.id,
        date,
      });
    }
  });

  await audit("TRIP_TRANSFER", "Trip", tripId, {
    type: "CONTRACTOR_FROM_OFFICE",
    amount,
  });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  revalidatePath(`/contractors/${trip.contractorId}`);
  revalidatePath("/finance");
  revalidatePath("/");
}

async function revalidateTripMoney(tripId: string, contractorId?: string | null) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  if (contractorId) revalidatePath(`/contractors/${contractorId}`);
  revalidatePath("/finance");
  revalidatePath("/");
}

function viaDriverMarker(collectionId: string) {
  return `[via-driver:${collectionId}]`;
}

function hasViaDriverMarker(note: string | null | undefined, collectionId: string) {
  return (note ?? "").includes(viaDriverMarker(collectionId));
}

export async function updateTripCollection(id: string, formData: FormData) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  const note = String(formData.get("note") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const current = await prisma.collection.findUnique({
    where: { id },
    include: {
      trip: {
        include: {
          collections: true,
          driverPayments: true,
          contractor: true,
          driver: true,
        },
      },
    },
  });
  if (!current) return { error: "حركة التحصيل غير موجودة" };
  if (current.trip.status === "CANCELLED") return { error: "الطلب ملغي" };

  const eff = effectiveAmounts(current.trip);
  const otherCollected = current.trip.collections
    .filter((c) => c.id !== id)
    .reduce((a, c) => a + c.amount, 0);
  if (otherCollected + amount > eff.contractor) {
    return { error: "المبلغ يتجاوز قيمة الرحلة المتبقية" };
  }
  const marker = viaDriverMarker(id);
  const linkedPayment =
    current.trip.driverPayments.find((p) => hasViaDriverMarker(p.note, id)) ??
    current.trip.driverPayments.find(
      (p) =>
        current.method === VIA_DRIVER &&
        p.method === VIA_DRIVER &&
        p.amount === current.amount &&
        +new Date(p.date) === +new Date(current.date) &&
        p.note === current.note
    );
  const otherPaid = current.trip.driverPayments
    .filter((p) => p.id !== linkedPayment?.id)
    .reduce((a, p) => a + p.amount, 0);
  const remainingDriverBefore = Math.max(eff.driver - otherPaid, 0);
  const driverPayAmount =
    method === VIA_DRIVER ? Math.min(amount, remainingDriverBefore) : 0;
  const externalDebt =
    method === VIA_DRIVER ? Math.max(amount - remainingDriverBefore, 0) : 0;
  const markedNote =
    method === VIA_DRIVER
      ? `${note ?? "تحصيل عن طريق السواق"} ${marker}`
      : note;

  await prisma.$transaction(async (tx) => {
    await tx.collection.update({
      where: { id },
      data: { amount, method, note: markedNote, date },
    });
    await tx.ledgerEntry.deleteMany({ where: { refType: "Collection", refId: id } });
    if (method !== VIA_DRIVER) {
      await recordLedger(tx, {
        type: "COLLECTION",
        direction: "IN",
        amount,
        method,
        description: `تحصيل — رحلة ${current.trip.startPoint} ← ${current.trip.endPoint}`,
        refType: "Collection",
        refId: id,
        date,
      });
    }
    if (method === VIA_DRIVER && current.trip.driverId) {
      if (linkedPayment && driverPayAmount > 0) {
        await tx.driverPayment.update({
          where: { id: linkedPayment.id },
          data: { amount: driverPayAmount, date, note: markedNote, method: VIA_DRIVER },
        });
      } else if (driverPayAmount > 0) {
        await tx.driverPayment.create({
          data: {
            tripId: current.tripId,
            driverId: current.trip.driverId,
            amount: driverPayAmount,
            method: VIA_DRIVER,
            date,
            note: markedNote,
          },
        });
      } else if (linkedPayment) {
        await tx.driverPayment.delete({ where: { id: linkedPayment.id } });
      }
      const existingExternal = await tx.externalAdvance.findFirst({
        where: { note: { contains: marker } },
      });
      if (externalDebt > 0 && current.trip.driver) {
        const externalNote = `زيادة تحصيل عن طريق السواق لرحلة ${current.trip.startPoint} ← ${current.trip.endPoint} ${marker}`;
        if (existingExternal) {
          await tx.externalAdvance.update({
            where: { id: existingExternal.id },
            data: { amount: externalDebt, date, note: externalNote, status: "OPEN", settledAt: null },
          });
        } else {
          await tx.externalAdvance.create({
            data: {
              borrowerType: "DRIVER",
              borrowerId: current.trip.driverId,
              borrowerName: current.trip.driver.name,
              lenderType: "CONTRACTOR",
              lenderId: current.trip.contractorId,
              lenderName: current.trip.contractor.name,
              amount: externalDebt,
              date,
              note: externalNote,
            },
          });
        }
      } else if (existingExternal) {
        await tx.externalAdvance.delete({ where: { id: existingExternal.id } });
      }
    } else if (linkedPayment) {
      await tx.driverPayment.delete({ where: { id: linkedPayment.id } });
      await tx.externalAdvance.deleteMany({ where: { note: { contains: marker } } });
    }
    await tx.trip.update({
      where: { id: current.tripId },
      data: { collectionStatus: deriveCollectionStatus(eff.contractor, otherCollected + amount) },
    });
  });

  await audit("EDIT_COLLECTION", "Trip", current.tripId, { collectionId: id, amount, method });
  await revalidateTripMoney(current.tripId, current.trip.contractorId);
}

export async function deleteTripCollection(id: string) {
  const current = await prisma.collection.findUnique({
    where: { id },
    include: { trip: { include: { collections: true, driverPayments: true } } },
  });
  if (!current) return { error: "حركة التحصيل غير موجودة" };
  if (current.trip.status === "CANCELLED") return { error: "الطلب ملغي" };

  const eff = effectiveAmounts(current.trip);
  const otherCollected = current.trip.collections
    .filter((c) => c.id !== id)
    .reduce((a, c) => a + c.amount, 0);

  await prisma.$transaction(async (tx) => {
    await tx.ledgerEntry.deleteMany({ where: { refType: "Collection", refId: id } });
    await tx.collection.delete({ where: { id } });
    if (current.method === VIA_DRIVER) {
      const marker = viaDriverMarker(id);
      const linkedPayment =
        current.trip.driverPayments.find((p) => hasViaDriverMarker(p.note, id)) ??
        current.trip.driverPayments.find(
          (p) =>
            p.method === VIA_DRIVER &&
            p.amount === current.amount &&
            +new Date(p.date) === +new Date(current.date) &&
            p.note === current.note
        );
      if (linkedPayment) {
        await tx.driverPayment.delete({ where: { id: linkedPayment.id } });
      }
      await tx.externalAdvance.deleteMany({ where: { note: { contains: marker } } });
    }
    await tx.trip.update({
      where: { id: current.tripId },
      data: { collectionStatus: deriveCollectionStatus(eff.contractor, otherCollected) },
    });
  });

  await audit("DELETE_COLLECTION", "Trip", current.tripId, { collectionId: id });
  await revalidateTripMoney(current.tripId, current.trip.contractorId);
}

export async function updateTripDriverPayment(id: string, formData: FormData) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  const note = String(formData.get("note") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const current = await prisma.driverPayment.findUnique({
    where: { id },
    include: { trip: { include: { driverPayments: true } } },
  });
  if (!current) return { error: "حركة السداد غير موجودة" };
  if (current.trip.status === "CANCELLED") return { error: "الطلب ملغي" };
  if (current.method === VIA_DRIVER) return { error: "عدّل تحصيل السواق من حركة التحصيل نفسها" };

  const eff = effectiveAmounts(current.trip);
  const otherPaid = current.trip.driverPayments
    .filter((p) => p.id !== id)
    .reduce((a, p) => a + p.amount, 0);
  if (otherPaid + amount > eff.driver) {
    return { error: "المبلغ يتجاوز مستحق السواق المتبقي" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.driverPayment.update({ where: { id }, data: { amount, method, note, date } });
    await tx.ledgerEntry.deleteMany({ where: { refType: "DriverPayment", refId: id } });
    await recordLedger(tx, {
      type: "DRIVER_PAYMENT",
      direction: "OUT",
      amount,
      method,
      description: `سداد سواق — رحلة ${current.trip.startPoint} ← ${current.trip.endPoint}`,
      refType: "DriverPayment",
      refId: id,
      date,
    });
  });

  await audit("EDIT_DRIVER_PAY", "Trip", current.tripId, { paymentId: id, amount, method });
  await revalidateTripMoney(current.tripId, current.trip.contractorId);
}

export async function deleteTripDriverPayment(id: string) {
  const current = await prisma.driverPayment.findUnique({
    where: { id },
    include: { trip: true },
  });
  if (!current) return { error: "حركة السداد غير موجودة" };
  if (current.trip.status === "CANCELLED") return { error: "الطلب ملغي" };
  if (current.method === VIA_DRIVER) return { error: "احذف تحصيل السواق من حركة التحصيل نفسها" };

  await prisma.$transaction(async (tx) => {
    await tx.ledgerEntry.deleteMany({ where: { refType: "DriverPayment", refId: id } });
    await tx.driverPayment.delete({ where: { id } });
  });

  await audit("DELETE_DRIVER_PAY", "Trip", current.tripId, { paymentId: id });
  await revalidateTripMoney(current.tripId, current.trip.contractorId);
}

export async function updateTripTransfer(id: string, formData: FormData) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const note = String(formData.get("note") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const current = await prisma.tripTransfer.findUnique({
    where: { id },
    include: { trip: { include: { collections: true, driverPayments: true } } },
  });
  if (!current) return { error: "التحويل غير موجود" };
  if (current.trip.status === "CANCELLED") return { error: "الطلب ملغي" };
  if (current.type !== "CONTRACTOR_FROM_DRIVER") {
    return { error: "هذا التحويل يعدّل من سجل السلف" };
  }

  const delta = amount - current.amount;
  const nextContractorPrice = current.trip.contractorPrice + delta;
  const nextDriverDue = current.trip.driverDue + delta;
  const collected = current.trip.collections.reduce((a, c) => a + c.amount, 0);
  const paid = current.trip.driverPayments.reduce((a, p) => a + p.amount, 0);
  const nextEffContractor = nextContractorPrice - current.trip.customerDiscount;
  const nextEffDriver = nextDriverDue + current.trip.driverTip;
  if (nextEffContractor < collected) return { error: "لا يمكن تقليل المبلغ لأن المحصل أكبر" };
  if (nextEffDriver < paid) return { error: "لا يمكن تقليل المبلغ لأن المدفوع للسواق أكبر" };

  await prisma.$transaction(async (tx) => {
    await tx.trip.update({
      where: { id: current.tripId },
      data: {
        contractorPrice: nextContractorPrice,
        driverDue: nextDriverDue,
        collectionStatus: deriveCollectionStatus(nextEffContractor, collected),
      },
    });
    await tx.tripTransfer.update({ where: { id }, data: { amount, note, date } });
  });

  await audit("EDIT_TRIP_TRANSFER", "Trip", current.tripId, { transferId: id, amount });
  await revalidateTripMoney(current.tripId, current.trip.contractorId);
}

export async function deleteTripTransfer(id: string) {
  const current = await prisma.tripTransfer.findUnique({
    where: { id },
    include: { trip: { include: { collections: true, driverPayments: true } } },
  });
  if (!current) return { error: "التحويل غير موجود" };
  if (current.trip.status === "CANCELLED") return { error: "الطلب ملغي" };
  if (current.type !== "CONTRACTOR_FROM_DRIVER") {
    return { error: "هذا التحويل يحذف من سجل السلف" };
  }

  const nextContractorPrice = current.trip.contractorPrice - current.amount;
  const nextDriverDue = current.trip.driverDue - current.amount;
  const collected = current.trip.collections.reduce((a, c) => a + c.amount, 0);
  const paid = current.trip.driverPayments.reduce((a, p) => a + p.amount, 0);
  const nextEffContractor = nextContractorPrice - current.trip.customerDiscount;
  const nextEffDriver = nextDriverDue + current.trip.driverTip;
  if (nextEffContractor < collected) return { error: "لا يمكن الحذف لأن المحصل أكبر من السعر بعد الحذف" };
  if (nextEffDriver < paid) return { error: "لا يمكن الحذف لأن المدفوع للسواق أكبر من مستحقه بعد الحذف" };

  await prisma.$transaction(async (tx) => {
    await tx.trip.update({
      where: { id: current.tripId },
      data: {
        contractorPrice: nextContractorPrice,
        driverDue: nextDriverDue,
        collectionStatus: deriveCollectionStatus(nextEffContractor, collected),
      },
    });
    await tx.tripTransfer.delete({ where: { id } });
  });

  await audit("DELETE_TRIP_TRANSFER", "Trip", current.tripId, { transferId: id });
  await revalidateTripMoney(current.tripId, current.trip.contractorId);
}

export async function updateTripAdvance(id: string, formData: FormData) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  const note = String(formData.get("note") ?? "").trim() || null;
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const current = await prisma.advance.findUnique({ where: { id } });
  if (!current || !current.tripId) return { error: "السلفة غير موجودة على الطلب" };
  const trip = await prisma.trip.findUnique({ where: { id: current.tripId }, include: { contractor: true } });
  if (!trip) return { error: "الطلب غير موجود" };
  if (trip.status === "CANCELLED") return { error: "الطلب ملغي" };

  await prisma.$transaction(async (tx) => {
    await tx.advance.update({ where: { id }, data: { amount, method, note, date } });
    await tx.ledgerEntry.deleteMany({ where: { refType: "Advance", refId: id } });
    await recordLedger(tx, {
      type: current.direction === "OUT" ? "ADVANCE_OUT" : "ADVANCE_IN",
      direction: current.direction as "IN" | "OUT",
      amount,
      method,
      description:
        current.direction === "OUT"
          ? `المقاول استلف من المكتب — ${trip.contractor.name}`
          : `سداد سلفة المقاول — ${trip.contractor.name}`,
      refType: "Advance",
      refId: id,
      date,
    });
  });

  await audit("EDIT_TRIP_ADVANCE", "Trip", current.tripId, { advanceId: id, amount, method });
  await revalidateTripMoney(current.tripId, current.partyId);
}

export async function deleteTripAdvance(id: string) {
  const current = await prisma.advance.findUnique({ where: { id } });
  if (!current || !current.tripId) return { error: "السلفة غير موجودة على الطلب" };
  const tripId = current.tripId;
  await prisma.$transaction(async (tx) => {
    await tx.ledgerEntry.deleteMany({ where: { refType: "Advance", refId: id } });
    await tx.advance.delete({ where: { id } });
  });

  await audit("DELETE_TRIP_ADVANCE", "Trip", tripId, { advanceId: id });
  await revalidateTripMoney(tripId, current.partyId);
}
