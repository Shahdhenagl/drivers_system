import { prisma } from "@/lib/prisma";
import { effectiveAmounts } from "@/lib/finance";

export async function getFinanceOverview() {
  const [trips, expenseAgg, collectionAgg, driverPayAgg, capitalSetting] =
    await Promise.all([
      prisma.trip.findMany({
        select: {
          status: true,
          contractorPrice: true,
          driverDue: true,
          contractorPenalty: true,
          driverPenalty: true,
        },
      }),
      prisma.expense.aggregate({ _sum: { amount: true } }),
      prisma.collection.aggregate({ _sum: { amount: true } }),
      prisma.driverPayment.aggregate({ _sum: { amount: true } }),
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
    totalPenaltyRevenue,
  };
}
