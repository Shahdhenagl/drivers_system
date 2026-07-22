"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { recordLedger, planSpend, planSpendMany } from "@/lib/finance";
import { getFinanceOverview } from "@/lib/finance-overview";
import { toPiastres, formatMoney } from "@/lib/money";
import { sendTelegram } from "@/lib/telegram";
import { adminDistributionMessage } from "@/lib/messages";
import {
  collectorNameFromMethod,
  driverIdFromAccountMethod,
  methodLabel,
  PAYMENT_METHOD_KEYS,
} from "@/lib/constants";
import { resolveCollector, type Collector } from "@/lib/collectors";

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

  // الوسيلة المختارة أولًا، والباقي من باقي الوسائل لو رصيدها ما يكفي
  const plan = await planSpend(method, amount, true);
  if (!plan.ok) {
    return { error: plan.error, balances: plan.balances, canFallback: false };
  }

  await prisma.$transaction(async (tx) => {
    const w = await tx.partnerWithdrawal.create({
      data: { partnerId, amount, method, note },
    });
    const partner = await tx.partner.findUnique({ where: { id: partnerId } });
    for (const e of plan.entries) {
      await recordLedger(tx, {
        type: "PARTNER_WITHDRAWAL",
        direction: "OUT",
        amount: e.amount,
        method: e.method,
        description:
          plan.entries.length > 1
            ? `سحب شريك - ${partner?.name ?? ""} (${methodLabel(e.method)})`
            : `سحب شريك - ${partner?.name ?? ""}`,
        refType: "PartnerWithdrawal",
        refId: w.id,
      });
    }
  });

  await audit("WITHDRAW", "Partner", partnerId, { amount, method });
  revalidatePath(`/partners/${partnerId}`);
  revalidatePath("/partners");
  revalidatePath("/finance");
}

export async function deleteWithdrawal(id: string) {
  const w = await prisma.partnerWithdrawal.findUnique({ where: { id } });
  if (!w) return { error: "السحب غير موجود" };
  // السحب المستلَم عن طريق محصّل (أو "حساب السواق" في السجلات القديمة) له سلفة
  // مقابلة على السواق لازم تتمسح معاه
  const collector = await resolveCollector(w.method);
  if (collector && "notFound" in collector) {
    return { error: `المحصّل «${collector.notFound}» غير موجود في السواقين` };
  }
  const driverId = collector?.id ?? driverIdFromAccountMethod(w.method);

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

  // استلام "عن طريق محصّل": الشريك بياخد نصيبه من فلوس المحصّل — يقلّل رصيده
  // (سلفة عليه) ولا يمسّ الخزنة، بالظبط زي المصروف عن طريق محصّل.
  const collectorByMethod = new Map<string, Collector>();
  for (const m of new Set(shares.map((s) => s.method))) {
    if (!collectorNameFromMethod(m)) continue;
    const c = await resolveCollector(m);
    if (c && "notFound" in c) {
      return { error: `المحصّل «${c.notFound}» غير موجود في السواقين` };
    }
    if (c) collectorByMethod.set(m, c);
  }

  for (const s of shares) {
    if (collectorByMethod.has(s.method)) continue;
    if (!PAYMENT_METHOD_KEYS.includes(s.method as never)) {
      return { error: `طريقة استلام غير صحيحة للشريك ${s.name}` };
    }
  }

  // الوسيلة اللي يختارها الشريك هي الأولوية، ولو رصيدها ما يكفي يتغطّى الباقي
  // من باقي الوسائل تلقائيًا — طالما الربح موجود في الخزنة يتوزّع عادي
  const spendPlan = await planSpendMany(
    shares
      .filter((s) => !collectorByMethod.has(s.method))
      .map((s) => ({ key: s.id, method: s.method, amount: s.amount }))
  );
  if (!spendPlan.ok) return { error: spendPlan.error, balances: spendPlan.balances };

  const reportShares: { name: string; percent: number; amount: number }[] = [];
  await prisma.$transaction(async (tx) => {
    const settlement = await tx.settlement.create({
      data: { totalProfit: amount, note },
    });
    for (const s of shares) {
      const collector = collectorByMethod.get(s.method) ?? null;
      const w = await tx.partnerWithdrawal.create({
        data: {
          partnerId: s.id,
          amount: s.amount,
          method: s.method,
          note: collector
            ? `توزيع أرباح عن طريق ${collector.name}`
            : "توزيع أرباح",
          settlementId: settlement.id,
        },
      });
      reportShares.push({ name: s.name, percent: s.percent, amount: s.amount });
      if (collector) {
        await tx.advance.create({
          data: {
            partyType: "DRIVER",
            partyId: collector.id,
            amount: s.amount,
            direction: "IN",
            method: s.method,
            note: `ربح شريك ${s.name} مستلم عن طريق ${collector.name} [withdrawal:${w.id}]`,
          },
        });
        continue;
      }
      // نصيب الشريك قد يتغطّى من أكثر من وسيلة — قيد لكل وسيلة بقيمتها الفعلية
      for (const e of spendPlan.plans.get(s.id) ?? []) {
        await recordLedger(tx, {
          type: "PARTNER_WITHDRAWAL",
          direction: "OUT",
          amount: e.amount,
          method: e.method,
          description: `توزيع أرباح - ${s.name} (${s.percent}%) - ${methodLabel(e.method)}`,
          refType: "PartnerWithdrawal",
          refId: w.id,
        });
      }
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
  const collectorIds = [...new Set([...collectorByMethod.values()].map((c) => c.id))];
  for (const driverId of collectorIds) revalidatePath(`/drivers/${driverId}`);
  if (collectorIds.length) revalidatePath("/drivers");
  revalidatePath("/finance");
  revalidatePath("/");
}
