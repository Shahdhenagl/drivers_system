import { prisma } from "@/lib/prisma";
import { effectiveAmounts } from "@/lib/finance";

export async function getFinanceOverview() {
  const [
    trips,
    expenseAgg,
    collectionAgg,
    driverPayAgg,
    advanceAgg,
    partnerWithdrawalAgg,
    capitalSetting,
  ] = await Promise.all([
      prisma.trip.findMany({
        select: {
          status: true,
          contractorPrice: true,
          driverDue: true,
          driverTip: true,
          customerDiscount: true,
          contractorSurcharge: true,
          contractorPenalty: true,
          driverPenalty: true,
        },
      }),
      prisma.expense.aggregate({ _sum: { amount: true } }),
      prisma.collection.aggregate({ _sum: { amount: true } }),
      prisma.driverPayment.aggregate({ _sum: { amount: true } }),
      // مرن: لو جدول الأرصدة غير موجود بعد (قبل الترحيل) نتعامل معه كصفر
      // نجمّع حسب كل طرف على حدة حتى لا تتقاصّ أرصدة الأطراف مع بعضها
      prisma.advance
        .groupBy({
          by: ["partyType", "partyId", "direction"],
          _sum: { amount: true },
        })
        .catch(
          () =>
            [] as {
              partyType: string;
              partyId: string;
              direction: string;
              _sum: { amount: number | null };
            }[]
        ),
      prisma.partnerWithdrawal.aggregate({ _sum: { amount: true } }),
      prisma.setting.findUnique({ where: { key: "initial_capital" } }),
    ]);

  // المبالغ الفعلية: عادية للرحلات النشطة، والغرامة للملغية (صفر عند السماح)
  const eff = trips.map(effectiveAmounts);
  const totalRevenue = eff.reduce((a, e) => a + e.contractor, 0);
  const totalDriverDue = eff.reduce((a, e) => a + e.driver, 0);
  const totalPenaltyRevenue = trips.reduce(
    (a, t) =>
      t.status === "CANCELLED"
        ? a + ((t.contractorPenalty ?? 0) - (t.driverPenalty ?? 0))
        : a,
    0
  );
  const totalCollected = collectionAgg._sum.amount ?? 0;
  const totalDeferred = Math.max(totalRevenue - totalCollected, 0);
  const totalPaidDrivers = driverPayAgg._sum.amount ?? 0;
  const totalRemainingDrivers = Math.max(totalDriverDue - totalPaidDrivers, 0);
  const totalExpenses = expenseAgg._sum.amount ?? 0;
  const grossProfit = totalRevenue - totalDriverDue;
  const netProfit = grossProfit - totalExpenses;
  const capital = Number(capitalSetting?.value ?? "0");

  // ما سحبه الشركاء من الربح (توزيعات + سحوبات فردية)
  const totalPartnerWithdrawals = partnerWithdrawalAgg._sum.amount ?? 0;
  // الربح المتاح للتوزيع/المصروفات = صافي الربح − ما سحبه الشركاء بالفعل
  const distributableProfit = netProfit - totalPartnerWithdrawals;

  // صافي رصيد كل طرف على حدة (OUT − IN): موجب = عليه لنا، سالب = لنا عليه (نحن مدينون له)
  const partyNet = new Map<string, number>();
  for (const r of advanceAgg) {
    const key = `${r.partyType}|${r.partyId}`;
    const amt = r._sum.amount ?? 0;
    partyNet.set(
      key,
      (partyNet.get(key) ?? 0) + (r.direction === "OUT" ? amt : -amt)
    );
  }
  // نجمع الموجب (عليهم لنا) والسالب (علينا لهم) كلٌّ على حدة لكل نوع طرف
  let driverOwesUs = 0; // سلف السواقين (عليهم لنا)
  let weOweDrivers = 0; // سلف من السواقين (علينا لهم)
  let contractorOwesUs = 0;
  for (const [key, net] of partyNet) {
    const pt = key.split("|")[0];
    if (pt === "DRIVER") {
      if (net > 0) driverOwesUs += net;
      else weOweDrivers += -net;
    } else if (pt === "CONTRACTOR") {
      if (net > 0) contractorOwesUs += net;
    }
  }
  const totalDriverAdvances = driverOwesUs;
  const totalDriverAdvancesOwed = weOweDrivers;
  const totalContractorAdvances = contractorOwesUs;

  // الربح المحصّل نقدًا (القابل للتوزيع فعليًا) — من عمليات الرحلات فقط،
  // معزولًا عن رأس المال والسلف: المحصّل − مستحقات السواقين − المصروفات − ما وُزّع على الشركاء.
  // (السواقون تُحجَز مستحقاتهم كاملةً، فلا يُوزَّع ربح قبل تغطية ما عليهم.)
  const realizedProfit = Math.max(
    0,
    totalCollected - totalDriverDue - totalExpenses - totalPartnerWithdrawals
  );

  return {
    capital,
    totalRevenue,
    totalCollected,
    totalDeferred,
    totalPaidDrivers,
    totalRemainingDrivers,
    totalExpenses,
    grossProfit,
    netProfit,
    totalPartnerWithdrawals,
    distributableProfit,
    realizedProfit,
    totalPenaltyRevenue,
    totalDriverAdvances,
    totalDriverAdvancesOwed,
    totalContractorAdvances,
  };
}
