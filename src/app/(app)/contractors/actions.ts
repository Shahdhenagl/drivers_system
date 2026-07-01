"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

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

export async function deleteContractor(id: string) {
  const trips = await prisma.trip.findMany({
    where: { contractorId: id },
    select: {
      _count: { select: { collections: true, driverPayments: true } },
    },
  });
  const hasMoney = trips.some(
    (t) => t._count.collections > 0 || t._count.driverPayments > 0
  );
  if (hasMoney) {
    return {
      error:
        "لا يمكن حذف هذا المقاول لوجود تحصيل أو سداد مسجّل على رحلاته. احذف الطلبات المعنية أولًا.",
    };
  }

  // حذف رحلاته الفارغة ثم حذفه
  await prisma.$transaction(async (tx) => {
    await tx.trip.deleteMany({ where: { contractorId: id } });
    await tx.contractor.delete({ where: { id } });
  });
  await audit("DELETE", "Contractor", id);
  revalidatePath("/contractors");
  redirect("/contractors");
}
