import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, addDays } from "@/lib/format";
import { effectiveAmounts } from "@/lib/finance";

export async function getDashboardStats() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const tomorrowStart = startOfDay(addDays(now, 1));
  const tomorrowEnd = endOfDay(addDays(now, 1));
  const weekStart = startOfDay(addDays(now, -6));
  const monthStart = startOfDay(addDays(now, -29));

  const notCancelled = { status: { not: "CANCELLED" } } as const;

  const [todayCount, tomorrowCount, inProgressCount] = await Promise.all([
    prisma.trip.count({
      where: { date: { gte: todayStart, lte: todayEnd }, ...notCancelled },
    }),
    prisma.trip.count({
      where: { date: { gte: tomorrowStart, lte: tomorrowEnd }, ...notCancelled },
    }),
    prisma.trip.count({ where: { status: "IN_PROGRESS" } }),
  ]);

  // العملاء المتأخرون: تشمل الرحلات النشطة وغرامات الإلغاء غير المسددة
  const openTrips = await prisma.trip.findMany({
    select: {
      contractorId: true,
      contractorPrice: true,
      driverId: true,
      driverDue: true,
      driverTip: true,
      customerDiscount: true,
      contractorPenalty: true,
      driverPenalty: true,
      date: true,
      status: true,
      collections: { select: { amount: true } },
      driverPayments: { select: { amount: true } },
    },
  });

  const overdueContractors = new Set<string>();
  let overdueAmount = 0;
  const driversOwed = new Set<string>();
  let driversOwedAmount = 0;

  let profitToday = 0;
  let profitWeek = 0;
  let profitMonth = 0;

  for (const t of openTrips) {
    const eff = effectiveAmounts(t);
    const collected = t.collections.reduce((a, c) => a + c.amount, 0);
    const remaining = eff.contractor - collected;
    if (remaining > 0) {
      overdueContractors.add(t.contractorId);
      overdueAmount += remaining;
    }
    if (t.driverId) {
      const paid = t.driverPayments.reduce((a, p) => a + p.amount, 0);
      const remDriver = eff.driver - paid;
      if (remDriver > 0) {
        driversOwed.add(t.driverId);
        driversOwedAmount += remDriver;
      }
    }
  }

  // صافي الربح حسب الفترة: ربح الرحلات المكتملة + غرامات الإلغاء - مصروفات الفترة
  const completed = await prisma.trip.findMany({
    where: {
      status: { in: ["COMPLETED", "CANCELLED"] },
      date: { gte: monthStart },
    },
    select: {
      status: true,
      contractorPrice: true,
      driverDue: true,
      driverTip: true,
      customerDiscount: true,
      contractorPenalty: true,
      driverPenalty: true,
      date: true,
    },
  });
  for (const t of completed) {
    const eff = effectiveAmounts(t);
    const p = eff.contractor - eff.driver;
    if (t.date >= todayStart && t.date <= todayEnd) profitToday += p;
    if (t.date >= weekStart) profitWeek += p;
    profitMonth += p;
  }

  const expenses = await prisma.expense.findMany({
    where: { date: { gte: monthStart } },
    select: { amount: true, date: true },
  });
  for (const e of expenses) {
    if (e.date >= todayStart && e.date <= todayEnd) profitToday -= e.amount;
    if (e.date >= weekStart) profitWeek -= e.amount;
    profitMonth -= e.amount;
  }

  return {
    todayCount,
    tomorrowCount,
    inProgressCount,
    overdueContractorsCount: overdueContractors.size,
    overdueAmount,
    driversOwedCount: driversOwed.size,
    driversOwedAmount,
    profitToday,
    profitWeek,
    profitMonth,
  };
}
