import { prisma } from "@/lib/prisma";
import { cairoDayStr } from "@/lib/format";
import { effectiveAmounts } from "@/lib/finance";

export async function getDashboardStats() {
  // حدود اليوم بتوقيت القاهرة (تواريخ الرحلات مخزَّنة منتصف ليل UTC) — مستقلة عن توقيت السيرفر
  const DAY = 24 * 60 * 60 * 1000;
  const todayStart = new Date(`${cairoDayStr()}T00:00:00.000Z`);
  const todayEnd = new Date(+todayStart + DAY); // نهاية اليوم (حصري)
  const tomorrowStart = todayEnd;
  const tomorrowEnd = new Date(+tomorrowStart + DAY);
  const weekStart = new Date(+todayStart - 6 * DAY);
  const monthStart = new Date(+todayStart - 29 * DAY);

  const [todayCount, tomorrowCount, openCount] = await Promise.all([
    prisma.trip.count({ where: { date: { gte: todayStart, lt: todayEnd } } }),
    prisma.trip.count({
      where: { date: { gte: tomorrowStart, lt: tomorrowEnd } },
    }),
    // «مؤكدة» = أي طلب لم يكتمل حسابه بعد
    prisma.trip.count({ where: { status: { not: "COMPLETED" } } }),
  ]);

  const openTrips = await prisma.trip.findMany({
    select: {
      contractorId: true,
      contractorPrice: true,
      driverId: true,
      driverDue: true,
      driverTip: true,
      customerDiscount: true,
      contractorSurcharge: true,
      date: true,
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

  // صافي الربح حسب الفترة: ربح الرحلات المكتملة - مصروفات الفترة
  const completed = await prisma.trip.findMany({
    where: { status: "COMPLETED", date: { gte: monthStart } },
    select: {
      contractorPrice: true,
      driverDue: true,
      driverTip: true,
      customerDiscount: true,
      contractorSurcharge: true,
      date: true,
    },
  });
  for (const t of completed) {
    const eff = effectiveAmounts(t);
    const p = eff.contractor - eff.driver;
    if (t.date >= todayStart && t.date < todayEnd) profitToday += p;
    if (t.date >= weekStart) profitWeek += p;
    profitMonth += p;
  }

  const expenses = await prisma.expense.findMany({
    where: { date: { gte: monthStart } },
    select: { amount: true, date: true },
  });
  for (const e of expenses) {
    if (e.date >= todayStart && e.date < todayEnd) profitToday -= e.amount;
    if (e.date >= weekStart) profitWeek -= e.amount;
    profitMonth -= e.amount;
  }

  return {
    todayCount,
    tomorrowCount,
    openCount,
    overdueContractorsCount: overdueContractors.size,
    overdueAmount,
    driversOwedCount: driversOwed.size,
    driversOwedAmount,
    profitToday,
    profitWeek,
    profitMonth,
  };
}
