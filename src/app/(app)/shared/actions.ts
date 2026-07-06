"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

/** بيانات مشتركة تُطبَّق على سجلَّي المقاول والسواق */
function readShared(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    altPhone: String(formData.get("altPhone") ?? "").trim() || null,
    phone3: String(formData.get("phone3") ?? "").trim() || null,
    company: String(formData.get("company") ?? "").trim() || null,
    vehicleType: String(formData.get("vehicleType") ?? "").trim(),
    vehicleNumber: String(formData.get("vehicleNumber") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

/** إنشاء حساب مشترك = سجل مقاول + سجل سواق مربوطين بنفس linkId */
export async function createShared(formData: FormData) {
  const d = readShared(formData);
  if (!d.name || !d.phone || !d.vehicleType) return;

  const linkId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.contractor.create({
      data: {
        name: d.name,
        phone: d.phone,
        altPhone: d.altPhone,
        phone3: d.phone3,
        company: d.company,
        notes: d.notes,
        linkId,
      },
    });
    await tx.driver.create({
      data: {
        name: d.name,
        phone: d.phone,
        altPhone: d.altPhone,
        phone3: d.phone3,
        vehicleType: d.vehicleType,
        vehicleNumber: d.vehicleNumber,
        notes: d.notes,
        linkId,
      },
    });
  });
  await audit("CREATE", "Shared", linkId, { name: d.name });
  revalidatePath("/shared");
  revalidatePath("/contractors");
  revalidatePath("/drivers");
}

/** تعديل بيانات الحساب المشترك على السجلَّين معًا */
export async function updateShared(linkId: string, formData: FormData) {
  const d = readShared(formData);
  if (!d.name || !d.phone || !d.vehicleType) return;

  await prisma.$transaction(async (tx) => {
    await tx.contractor.updateMany({
      where: { linkId },
      data: {
        name: d.name,
        phone: d.phone,
        altPhone: d.altPhone,
        phone3: d.phone3,
        company: d.company,
        notes: d.notes,
      },
    });
    await tx.driver.updateMany({
      where: { linkId },
      data: {
        name: d.name,
        phone: d.phone,
        altPhone: d.altPhone,
        phone3: d.phone3,
        vehicleType: d.vehicleType,
        vehicleNumber: d.vehicleNumber,
        notes: d.notes,
      },
    });
  });
  await audit("UPDATE", "Shared", linkId);
  revalidatePath("/shared");
  revalidatePath(`/shared/${linkId}`);
  revalidatePath("/contractors");
  revalidatePath("/drivers");
}

/** علامة المراجعة اليومية للحساب المشترك (تُطبَّق على السجلَّين) */
export async function setSharedReviewed(linkId: string, reviewed: boolean) {
  const at = reviewed ? new Date() : null;
  await prisma.$transaction(async (tx) => {
    await tx.contractor.updateMany({ where: { linkId }, data: { lastReviewedAt: at } });
    await tx.driver.updateMany({ where: { linkId }, data: { lastReviewedAt: at } });
  });
  revalidatePath(`/shared/${linkId}`);
}

/** حذف الحساب المشترك (السجلَّين) — ممنوع لو عليه حركات مالية */
export async function deleteShared(linkId: string) {
  const [contractor, driver] = await Promise.all([
    prisma.contractor.findFirst({
      where: { linkId },
      select: {
        id: true,
        trips: {
          select: { _count: { select: { collections: true, driverPayments: true } } },
        },
      },
    }),
    prisma.driver.findFirst({
      where: { linkId },
      select: { id: true },
    }),
  ]);
  if (!contractor && !driver) return { error: "الحساب غير موجود" };

  const contractorHasMoney = (contractor?.trips ?? []).some(
    (t) => t._count.collections > 0 || t._count.driverPayments > 0
  );
  const driverPayCount = driver
    ? await prisma.driverPayment.count({ where: { driverId: driver.id } })
    : 0;
  if (contractorHasMoney || driverPayCount > 0) {
    return {
      error:
        "لا يمكن حذف الحساب المشترك لوجود تحصيل أو سداد مسجّل. احذف الحركات المعنية أولًا.",
    };
  }

  await prisma.$transaction(async (tx) => {
    if (contractor) {
      await tx.trip.deleteMany({ where: { contractorId: contractor.id } });
    }
    if (driver) {
      await tx.trip.updateMany({ where: { driverId: driver.id }, data: { driverId: null } });
      await tx.driver.delete({ where: { id: driver.id } });
    }
    if (contractor) {
      await tx.contractor.delete({ where: { id: contractor.id } });
    }
  });
  await audit("DELETE", "Shared", linkId);
  revalidatePath("/shared");
  revalidatePath("/contractors");
  revalidatePath("/drivers");
  redirect("/shared");
}
