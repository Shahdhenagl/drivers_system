import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, addDays } from "@/lib/format";

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

  // العملاء المتأخرون: رحلات غير ملغية لم يكتمل تحصيلها
  const openTrips = await prisma.trip.findMany({
    where: { status: { not: "CANCELLED" } },
    select: {
      contractorId: true,
      contractorPrice: true,
      driverId: true,
      driverDue: true,
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
    const collected = t.collections.reduce((a, c) => a + c.amount, 0);
    const remaining = t.contractorPrice - collected;
    if (remaining > 0) {
      overdueContractors.add(t.contractorId);
      overdueAmount += remaining;
    }
    if (t.driverId) {
      const paid = t.driverPayments.reduce((a, p) => a + p.amount, 0);
      const remDriver = t.driverDue - paid;
      if (remDriver > 0) {
        driversOwed.add(t.driverId);
        driversOwedAmount += remDriver;
      }
    }
  }

  // صافي الربح حسب الفترة: ربح الرحلات المكتملة - مصروفات الفترة
  const completed = await prisma.trip.findMany({
    where: { status: "COMPLETED", date: { gte: monthStart } },
    select: { contractorPrice: true, driverDue: true, date: true },
  });
  for (const t of completed) {
    const p = t.contractorPrice - t.driverDue;
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
