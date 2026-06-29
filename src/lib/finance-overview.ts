import { prisma } from "@/lib/prisma";

export async function getFinanceOverview() {
  const [trips, expenseAgg, collectionAgg, driverPayAgg, capitalSetting] =
    await Promise.all([
      prisma.trip.findMany({
        where: { status: { not: "CANCELLED" } },
        select: { contractorPrice: true, driverDue: true },
      }),
      prisma.expense.aggregate({ _sum: { amount: true } }),
      prisma.collection.aggregate({ _sum: { amount: true } }),
      prisma.driverPayment.aggregate({ _sum: { amount: true } }),
      prisma.setting.findUnique({ where: { key: "initial_capital" } }),
    ]);

  const totalRevenue = trips.reduce((a, t) => a + t.contractorPrice, 0);
  const totalDriverDue = trips.reduce((a, t) => a + t.driverDue, 0);
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
  };
}
