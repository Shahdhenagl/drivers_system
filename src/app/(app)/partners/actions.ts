"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { recordLedger, planSpend } from "@/lib/finance";
import { getFinanceOverview } from "@/lib/finance-overview";
import { toPiastres, formatMoney } from "@/lib/money";
import { sendTelegram } from "@/lib/telegram";
import { adminDistributionMessage } from "@/lib/messages";
import {
  driverIdFromAccountMethod,
  methodLabel,
  PAYMENT_METHOD_KEYS,
} from "@/lib/constants";

export async function createPartner(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const sharePercent = Number(formData.get("sharePercent") ?? "0");
  if (!name || sharePercent <= 0)
    return { error: "اكتب اسم الشريك ونسبة صحيحة" };

  // مجموع نسب الشركاء لا يتجاوز 100%
  const others = await prisma.partner.aggregate({ _sum: { sharePercent: true } });
  const othersTotal = others._sum.sharePercent ?? 0;
  if (othersTotal + sharePercent > 100) {
    return {
      error: `مجموع نسب الشركاء لا يتجاوز 100% — المتبقّي المتاح ${100 - othersTotal}%`,
    };
  }

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
  if (!name || sharePercent <= 0)
    return { error: "اكتب اسم الشريك ونسبة صحيحة" };

  // مجموع نسب الشركاء (بعد هذا التعديل) لا يتجاوز 100%
  const others = await prisma.partner.aggregate({
    where: { id: { not: id } },
    _sum: { sharePercent: true },
  });
  const othersTotal = others._sum.sharePercent ?? 0;
  if (othersTotal + sharePercent > 100) {
    return {
      error: `مجموع نسب الشركاء لا يتجاوز 100% — المتبقّي المتاح ${100 - othersTotal}%`,
    };
  }

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

export async function addWithdrawal(partnerId: string, formData: FormData) {
  const amount = toPiastres(String(formData.get("amount") ?? "0"));
  const method = String(formData.get("method") ?? "cash");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (amount <= 0) return { error: "اكتب قيمة صحيحة" };

  // السحب لا يتجاوز نصيب الشريك من الربح المحصّل نقدًا ناقص ما سحبه سابقًا
  const partnerRow = await prisma.partner.findUnique({
    where: { id: partnerId },
    include: { withdrawals: { select: { amount: true } } },
  });
  if (!partnerRow) return { error: "الشريك غير موجود" };
  const ov = await getFinanceOverview();
  const entitlement = Math.round((ov.grossRealizedProfit * partnerRow.sharePercent) / 100);
  const alreadyWithdrawn = partnerRow.withdrawals.reduce((a, w) => a + w.amount, 0);
  const partnerAvailable = Math.max(entitlement - alreadyWithdrawn, 0);
  if (amount > partnerAvailable) {
    return {
      error: `نصيب الشريك المتاح للسحب ${formatMoney(partnerAvailable)} — لا يمكن سحب أكثر منه`,
    };
  }

  const plan = await planSpend(method, amount, false);
  if (!plan.ok) {
    return { error: plan.error, balances: plan.balances, canFallback: plan.canFallback };
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
      description: `سحب شريك - ${partner?.name ?? ""}`,
      refType: "PartnerWithdrawal",
      refId: w.id,
    });
  });

  await audit("WITHDRAW", "Partner", partnerId, { amount, method });
  revalidatePath(`/partners/${partnerId}`);
  revalidatePath("/partners");
  revalidatePath("/finance");
}

export async function deleteWithdrawal(id: string) {
  const w = await prisma.partnerWithdrawal.findUnique({ where: { id } });
  if (!w) return { error: "السحب غير موجود" };
  const driverId = driverIdFromAccountMethod(w.method);

  await prisma.$transaction(async (tx) => {
    await tx.ledgerEntry.deleteMany({
      where: { refType: "PartnerWithdrawal", refId: id },
    });
    if (driverId) {
      const linkedAdvance = await tx.advance.findFirst({
        where: {
          partyType: "DRIVER",
          partyId: driverId,
          amount: w.amount,
          direction: "IN",
          method: w.method,
          note: { contains: `[withdrawal:${id}]` },
        },
        orderBy: { createdAt: "desc" },
      });
      if (linkedAdvance) await tx.advance.delete({ where: { id: linkedAdvance.id } });
    }
    await tx.partnerWithdrawal.delete({ where: { id } });
  });

  await audit("DELETE_WITHDRAW", "Partner", w.partnerId, { amount: w.amount });
  revalidatePath(`/partners/${w.partnerId}`);
  revalidatePath("/partners");
  revalidatePath("/finance");
  if (driverId) revalidatePath(`/drivers/${driverId}`);
  revalidatePath("/");
}

export async function distributeProfits(formData: FormData) {
  const note = String(formData.get("note") ?? "").trim() || null;

  const partners = await prisma.partner.findMany();
  if (partners.length === 0) return { error: "لا يوجد شركاء" };

  const totalShare = partners.reduce((a, p) => a + p.sharePercent, 0);
  if (totalShare <= 0) return { error: "نسب الشركاء غير صحيحة" };
  // التوزيع يتطلّب اكتمال النسب إلى 100% حتى يأخذ كل شريك نصيبه الصحيح كاملًا
  if (Math.abs(totalShare - 100) > 0.001) {
    return {
      error: `مجموع نسب الشركاء ${totalShare}% — يجب أن يكون 100% قبل التوزيع`,
    };
  }

  const ov = await getFinanceOverview();
  // التوزيع من الربح المحصّل نقدًا فقط — لا يُوزَّع ربح لم يدخل الخزنة فعلًا (حماية رأس المال)
  const pool = Math.max(ov.realizedProfit, 0);
  if (pool <= 0) return { error: "لا يوجد ربح محصّل نقدًا متاح للتوزيع" };

  const raw = toPiastres(String(formData.get("amount") ?? "0"));
  const amount = raw > 0 ? raw : pool;
  if (amount > pool) {
    return {
      error: `الربح المتاح للتوزيع ${formatMoney(pool)} - لا يمكن توزيع أكثر منه`,
    };
  }

  const allShares = partners.map((p) => ({
    id: p.id,
    name: p.name,
    percent: p.sharePercent,
    amount: Math.round((amount * p.sharePercent) / totalShare),
    method: String(formData.get(`method_${p.id}`) ?? "cash"),
  }));
  // تصحيح فرق التقريب حتى يساوي مجموع الأنصبة المبلغ المطلوب بالضبط (يُضاف للأكبر نصيبًا)
  const roundingDiff = amount - allShares.reduce((a, s) => a + s.amount, 0);
  if (roundingDiff !== 0 && allShares.length > 0) {
    const biggest = allShares.reduce((a, b) => (b.amount > a.amount ? b : a));
    biggest.amount += roundingDiff;
  }
  const shares = allShares.filter((s) => s.amount > 0);

  const driverIds = shares
    .map((s) => driverIdFromAccountMethod(s.method))
    .filter((id): id is string => Boolean(id));
  const drivers = driverIds.length
    ? await prisma.driver.findMany({
        where: { id: { in: driverIds } },
        select: { id: true, name: true },
      })
    : [];
  const driverById = new Map(drivers.map((d) => [d.id, d]));

  for (const s of shares) {
    const driverId = driverIdFromAccountMethod(s.method);
    if (driverId && !driverById.has(driverId)) {
      return { error: `حساب السواق المختار للشريك ${s.name} غير موجود` };
    }
    if (!driverId && !PAYMENT_METHOD_KEYS.includes(s.method as never)) {
      return { error: `طريقة استلام غير صحيحة للشريك ${s.name}` };
    }
  }

  const methodTotals = new Map<string, number>();
  for (const s of shares) {
    if (driverIdFromAccountMethod(s.method)) continue;
    methodTotals.set(s.method, (methodTotals.get(s.method) ?? 0) + s.amount);
  }
  for (const [m, total] of methodTotals) {
    const plan = await planSpend(m, total, false);
    if (!plan.ok) {
      return { error: plan.error, balances: plan.balances, canFallback: plan.canFallback };
    }
  }

  const reportShares: { name: string; percent: number; amount: number }[] = [];
  await prisma.$transaction(async (tx) => {
    const settlement = await tx.settlement.create({
      data: { totalProfit: amount, note },
    });
    for (const s of shares) {
      const driverId = driverIdFromAccountMethod(s.method);
      const driver = driverId ? driverById.get(driverId) : null;
      const w = await tx.partnerWithdrawal.create({
        data: {
          partnerId: s.id,
          amount: s.amount,
          method: s.method,
          note: driver
            ? `توزيع أرباح على حساب السواق ${driver.name}`
            : "توزيع أرباح",
          settlementId: settlement.id,
        },
      });
      reportShares.push({ name: s.name, percent: s.percent, amount: s.amount });
      if (driver) {
        await tx.advance.create({
          data: {
            partyType: "DRIVER",
            partyId: driver.id,
            amount: s.amount,
            direction: "IN",
            method: s.method,
            note: `ربح شريك مستلم على حساب السواق - ${s.name} [withdrawal:${w.id}]`,
          },
        });
        continue;
      }
      await recordLedger(tx, {
        type: "PARTNER_WITHDRAWAL",
        direction: "OUT",
        amount: s.amount,
        method: s.method,
        description: `توزيع أرباح - ${s.name} (${s.percent}%) - ${methodLabel(s.method)}`,
        refType: "PartnerWithdrawal",
        refId: w.id,
      });
    }
  });

  await audit("DISTRIBUTE", "Settlement", undefined, { amount });

  try {
    await sendTelegram(
      adminDistributionMessage({ total: amount, method: "mixed", note, shares: reportShares })
    );
  } catch {
    // Ignore notification errors.
  }

  revalidatePath("/partners");
  for (const driverId of driverIds) revalidatePath(`/drivers/${driverId}`);
  if (driverIds.length) revalidatePath("/drivers");
  revalidatePath("/finance");
  revalidatePath("/");
}
