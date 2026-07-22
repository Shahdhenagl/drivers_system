import { prisma } from "@/lib/prisma";
import { effectiveAmounts } from "@/lib/finance";
import { EXTRA_PROFIT_METHOD, TIP_METHOD, PAYMENT_METHOD_KEYS } from "@/lib/constants";
import { purgeOrphanFinance } from "@/lib/purge-orphans";

export async function getFinanceOverview() {
  // تنظيف تلقائي: أي حركة طرفها اتحذف تُمسح قبل حساب الإجماليات فلا تظهر أبدًا
  await purgeOrphanFinance();

  const [
    trips,
    expenseAgg,
    collectionAgg,
    driverPayAgg,
    advanceAgg,
    partnerWithdrawalAgg,
    capitalSetting,
    extraProfitAgg,
    driverTipAgg,
    cashCollectionAgg,
    externalHoldAgg,
  ] = await Promise.all([
      prisma.trip.findMany({
        select: {
          contractorPrice: true,
          driverDue: true,
          driverTip: true,
          customerDiscount: true,
          contractorSurcharge: true,
          collections: { select: { amount: true } },
          driverPayments: { select: { amount: true } },
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
      // أرباح إضافية (حركات على الحساب) — تُضاف للربح
      prisma.advance
        .aggregate({ where: { method: EXTRA_PROFIT_METHOD }, _sum: { amount: true } })
        .catch(() => ({ _sum: { amount: 0 } })),
      // إكراميات — تُخصم من الربح
      prisma.advance
        .aggregate({ where: { method: TIP_METHOD }, _sum: { amount: true } })
        .catch(() => ({ _sum: { amount: 0 } })),
      // تحصيل نقدي فعلي فقط (يستبعد المقاصّة/عن طريق السواق التي لا تدخل الخزنة)
      prisma.collection.aggregate({
        where: { method: { in: PAYMENT_METHOD_KEYS } },
        _sum: { amount: true },
      }),
      // أمانة السلف الخارجية: اتحصّلت من المستلِف ولسه ما اتسلّمتش للمُقرِض
      prisma.externalAdvance
        .aggregate({ _sum: { collectedAmount: true, paidAmount: true } })
        .catch(() => ({ _sum: { collectedAmount: 0, paidAmount: 0 } })),
    ]);

  const eff = trips.map(effectiveAmounts);
  const totalRevenue = eff.reduce((a, e) => a + e.contractor, 0);
  const totalDriverDue = eff.reduce((a, e) => a + e.driver, 0);
  const totalCollected = collectionAgg._sum.amount ?? 0;
  const totalDeferred = Math.max(totalRevenue - totalCollected, 0);
  const totalPaidDrivers = driverPayAgg._sum.amount ?? 0;
  const totalRemainingDrivers = Math.max(totalDriverDue - totalPaidDrivers, 0);
  const totalExpenses = expenseAgg._sum.amount ?? 0;
  // أرباح إضافية محصّلة (خارج الرحلات) تُضاف للربح، وإكراميات السواقين تُخصم منه
  const totalExtraProfit = extraProfitAgg._sum.amount ?? 0;
  const totalDriverTips = driverTipAgg._sum.amount ?? 0;
  const grossProfit = totalRevenue - totalDriverDue + totalExtraProfit - totalDriverTips;
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
  let contractorOwesUs = 0; // على المقاولين لنا
  let weOweContractors = 0; // أرصدة دائنة للمقاولين (علينا لهم) — تُحسب التزامًا
  for (const [key, net] of partyNet) {
    const pt = key.split("|")[0];
    if (pt === "DRIVER") {
      if (net > 0) driverOwesUs += net;
      else weOweDrivers += -net;
    } else if (pt === "CONTRACTOR") {
      if (net > 0) contractorOwesUs += net;
      else weOweContractors += -net;
    }
  }
  const totalDriverAdvances = driverOwesUs;
  const totalDriverAdvancesOwed = weOweDrivers;
  const totalContractorAdvances = contractorOwesUs;
  const totalContractorAdvancesOwed = weOweContractors;

  const cashCollected = cashCollectionAgg._sum.amount ?? 0;
  // أمانة محتجزة في الخزنة لصالح مُقرِضي السلف الخارجية — التزام لا يخصّ المكتب
  const externalHeld = Math.max(
    (externalHoldAgg._sum.collectedAmount ?? 0) -
      (externalHoldAgg._sum.paidAmount ?? 0),
    0
  );

  // ===== الربح القابل للتوزيع = ربح الرحلات المقفولة =====
  // الرحلة «مقفولة» لما يتم تحصيل سعر المقاول بالكامل ويُسدَّد مستحق سواقها بالكامل،
  // وساعتها ربحها (سعر المقاول − مستحق السواق) بقى محقَّقًا فعلًا ويدخل التوزيع.
  // الرحلات الآجلة أو اللي سواقها لسه ما اتسدّدش لا تؤثّر على ربح غيرها.
  // يُخصم منه: المصروفات، والإكراميات المستحقة للأطراف، وما سحبه الشركاء.
  // (الأرباح الإضافية على الحساب لا تدخل حتى تتحوّل إلى تحصيل فعلي.)
  let closedTripsProfit = 0;
  let closedTripsCount = 0;
  for (const t of trips) {
    const e = effectiveAmounts(t);
    const collected = t.collections.reduce((s, x) => s + x.amount, 0);
    const paid = t.driverPayments.reduce((s, x) => s + x.amount, 0);
    if (collected >= e.contractor && paid >= e.driver) {
      closedTripsProfit += e.contractor - e.driver;
      closedTripsCount += 1;
    }
  }
  // الربح المحقّق قبل خصم سحوبات الشركاء (أساس حساب نصيب كل شريك)
  const grossRealizedProfit = Math.max(
    0,
    closedTripsProfit - totalExpenses - totalDriverTips
  );
  const realizedProfit = Math.max(0, grossRealizedProfit - totalPartnerWithdrawals);

  return {
    capital,
    totalRevenue,
    totalCollected,
    totalDeferred,
    totalPaidDrivers,
    totalRemainingDrivers,
    totalExpenses,
    totalExtraProfit,
    totalDriverTips,
    grossProfit,
    netProfit,
    totalPartnerWithdrawals,
    distributableProfit,
    realizedProfit,
    grossRealizedProfit,
    closedTripsProfit,
    closedTripsCount,
    cashCollected,
    externalHeld,
    totalDriverAdvances,
    totalDriverAdvancesOwed,
    totalContractorAdvances,
    totalContractorAdvancesOwed,
  };
}
