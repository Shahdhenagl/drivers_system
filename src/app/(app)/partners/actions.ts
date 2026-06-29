"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { recordLedger, availableInMethod } from "@/lib/finance";
import { toPiastres } from "@/lib/money";

export async function createPartner(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const sharePercent = Number(formData.get("sharePercent") ?? "0");
  if (!name || sharePercent <= 0) throw new Error("بيانات غير صحيحة");

  const p = await prisma.partner.create({
    data: {
      name,
      sharePercent,
      phone: String(formData.get("phone") ?? "").trim() || null,
    },
  });
  await audit("CREATE", "Partner", p.id, { name });
  revalidatePath("/partners");
}

export async function updatePartner(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const sharePercent = Number(formData.get("sharePercent") ?? "0");
  if (!name || sharePercent <= 0) throw new Error("بيانات غير صحيحة");

  await prisma.partner.update({
    where: { id },
    data: {
      name,
      sharePercent,
      phone: String(formData.get("phone") ?? "").trim() || null,
    },
  });
  await audit("UPDATE", "Partner", id);
  revalidatePath("/partners");
  revalidatePath(`/partners/${id}`);
}

export async function deletePartner(id: string) {
  await prisma.$transaction(async (tx) => {
    await tx.partnerWithdrawal.deleteMany({ where: { partnerId: id } });
    await tx.partner.delete({ where: { id } });
  });
  await audit("DELETE", "Partner", id);
  revalidatePath("/partners");
  redirect("/partners");
}

/** سحب فردي لشريك */
export async function addWithdrawal(partnerId: string, formData: FormData) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (amount <= 0) throw new Error("القيمة غير صحيحة");

  const available = await availableInMethod(method);
  if (amount > available) {
    throw new Error("المبلغ أكبر من رصيد الخزنة في طريقة الدفع");
  }

  await prisma.$transaction(async (tx) => {
    const w = await tx.partnerWithdrawal.create({
      data: { partnerId, amount, method, note },
    });
    const partner = await tx.partner.findUnique({ where: { id: partnerId } });
    await recordLedger(tx, {
      type: "PARTNER_WITHDRAWAL",
      direction: "OUT",
      amount,
      method,
      description: `سحب شريك — ${partner?.name ?? ""}`,
      refType: "PartnerWithdrawal",
      refId: w.id,
    });
  });

  await audit("WITHDRAW", "Partner", partnerId, { amount, method });
  revalidatePath(`/partners/${partnerId}`);
  revalidatePath("/partners");
  revalidatePath("/finance");
}

/** تصفية الخزنة: توزيع مبلغ أرباح على الشركاء حسب النسبة (كاش) */
export async function distributeProfits(formData: FormData) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (amount <= 0) throw new Error("القيمة غير صحيحة");

  const partners = await prisma.partner.findMany();
  if (partners.length === 0) throw new Error("لا يوجد شركاء");

  const totalShare = partners.reduce((a, p) => a + p.sharePercent, 0);
  if (totalShare <= 0) throw new Error("نسب الشركاء غير صحيحة");

  const available = await availableInMethod(method);
  if (amount > available) {
    throw new Error("المبلغ أكبر من رصيد الخزنة في طريقة الدفع");
  }

  await prisma.$transaction(async (tx) => {
    const settlement = await tx.settlement.create({
      data: { totalProfit: amount, note },
    });
    for (const p of partners) {
      const share = Math.round((amount * p.sharePercent) / totalShare);
      if (share <= 0) continue;
      const w = await tx.partnerWithdrawal.create({
        data: {
          partnerId: p.id,
          amount: share,
          method,
          note: "توزيع أرباح",
          settlementId: settlement.id,
        },
      });
      await recordLedger(tx, {
        type: "PARTNER_WITHDRAWAL",
        direction: "OUT",
        amount: share,
        method,
        description: `توزيع أرباح — ${p.name} (${p.sharePercent}%)`,
        refType: "PartnerWithdrawal",
        refId: w.id,
      });
    }
  });

  await audit("DISTRIBUTE", "Settlement", undefined, { amount });
  revalidatePath("/partners");
  revalidatePath("/finance");
  revalidatePath("/");
}
