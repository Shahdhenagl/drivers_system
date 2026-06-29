import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { PAYMENT_METHOD_KEYS, type PaymentMethod } from "@/lib/constants";

type DB = Prisma.TransactionClient | typeof prisma;

/** تسجيل قيد في دفتر الأستاذ (المصدر الوحيد للخزنة والأرباح) */
export async function recordLedger(
  db: DB,
  data: {
    type: string;
    direction: "IN" | "OUT";
    amount: number; // قروش موجبة
    method: string;
    description: string;
    refType?: string;
    refId?: string;
    date?: Date;
  }
) {
  return db.ledgerEntry.create({
    data: {
      type: data.type,
      direction: data.direction,
      amount: Math.abs(Math.round(data.amount)),
      method: data.method,
      description: data.description,
      refType: data.refType,
      refId: data.refId,
      date: data.date ?? new Date(),
    },
  });
}

/** رصيد الخزنة مقسّمًا حسب طريقة الدفع (من المعاملات الفعلية فقط) */
export async function treasuryByMethod(): Promise<
  Record<PaymentMethod, number> & { total: number }
> {
  const rows = await prisma.ledgerEntry.groupBy({
    by: ["method", "direction"],
    _sum: { amount: true },
  });

  const result = { cash: 0, instapay: 0, visa: 0, wallet: 0, total: 0 } as Record<
    PaymentMethod,
    number
  > & { total: number };

  for (const r of rows) {
    const m = r.method as PaymentMethod;
    if (!PAYMENT_METHOD_KEYS.includes(m)) continue;
    const sum = r._sum.amount ?? 0;
    result[m] += r.direction === "IN" ? sum : -sum;
  }
  result.total = PAYMENT_METHOD_KEYS.reduce((a, m) => a + result[m], 0);
  return result;
}

/** الرصيد المتاح في طريقة دفع معيّنة (لمنع الصرف بأكثر من الموجود) */
export async function availableInMethod(method: string): Promise<number> {
  const t = await treasuryByMethod();
  return (t as Record<string, number>)[method] ?? 0;
}

export type TripLike = {
  contractorPrice: number;
  driverDue: number;
  collections: { amount: number }[];
  driverPayments: { amount: number }[];
};

/** حسابات الرحلة الواحدة */
export function tripFinancials(trip: TripLike) {
  const collected = trip.collections.reduce((a, c) => a + c.amount, 0);
  const remainingCollection = Math.max(trip.contractorPrice - collected, 0);
  const paidToDriver = trip.driverPayments.reduce((a, p) => a + p.amount, 0);
  const remainingDriver = Math.max(trip.driverDue - paidToDriver, 0);
  const profit = trip.contractorPrice - trip.driverDue;
  return {
    collected,
    remainingCollection,
    paidToDriver,
    remainingDriver,
    profit,
  };
}

/** حالة التحصيل المحسوبة تلقائيًا */
export function deriveCollectionStatus(
  contractorPrice: number,
  collected: number
): "NONE" | "PARTIAL" | "FULL" {
  if (collected <= 0) return "NONE";
  if (collected >= contractorPrice) return "FULL";
  return "PARTIAL";
}
