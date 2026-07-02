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
import { toPiastres, formatMoney } from "@/lib/money";

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

/** تحصيل مجمّع من المقاول — يوزَّع على رحلاته المستحقة الأقدم أولًا، ويقبل تحصيلًا جزئيًا */
export async function collectAllFromContractor(
  contractorId: string,
  formData: FormData
) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  const note = String(formData.get("note") ?? "").trim() || "تحصيل مجمّع";
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  const trips = await prisma.trip.findMany({
    where: { contractorId },
    orderBy: { date: "asc" },
    include: { collections: true },
  });

  // المتبقي على كل رحلة (يراعي الخصم والغرامة عند الإلغاء)
  const outstanding = trips
    .map((t) => {
      const eff = effectiveAmounts(t);
      const collected = t.collections.reduce((s, x) => s + x.amount, 0);
      return { trip: t, eff, collected, remaining: Math.max(eff.contractor - collected, 0) };
    })
    .filter((o) => o.remaining > 0);

  const totalRemaining = outstanding.reduce((a, o) => a + o.remaining, 0);
  if (totalRemaining <= 0) return { error: "لا يوجد مبلغ مستحق على المقاول" };
  if (amount > totalRemaining) {
    return {
      error: `المبلغ أكبر من إجمالي المتبقي (${formatMoney(totalRemaining)})`,
    };
  }

  await prisma.$transaction(async (tx) => {
    let left = amount;
    for (const o of outstanding) {
      if (left <= 0) break;
      const pay = Math.min(o.remaining, left);
      left -= pay;
      const col = await tx.collection.create({
        data: { tripId: o.trip.id, amount: pay, method, date, note },
      });
      await recordLedger(tx, {
        type: "COLLECTION",
        direction: "IN",
        amount: pay,
        method,
        description: `تحصيل — رحلة ${o.trip.startPoint} ← ${o.trip.endPoint}`,
        refType: "Collection",
        refId: col.id,
        date,
      });
      await tx.trip.update({
        where: { id: o.trip.id },
        data: {
          collectionStatus: deriveCollectionStatus(
            o.eff.contractor,
            o.collected + pay
          ),
        },
      });
    }
  });

  await audit("COLLECT_ALL", "Contractor", contractorId, { amount, method });
  revalidatePath(`/contractors/${contractorId}`);
  revalidatePath("/contractors");
  revalidatePath("/finance");
  revalidatePath("/");
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
