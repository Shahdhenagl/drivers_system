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

/**
 * رصيد الخزنة (السيولة التشغيلية) مقسّمًا حسب طريقة الدفع.
 * يستثني رأس المال (CAPITAL) — فهو رقم ثابت منفصل وليس جزءًا من السيولة.
 * يمكن أن يكون سالبًا لو زاد الصرف عن المحصّل.
 */
export async function treasuryByMethod(): Promise<
  Record<PaymentMethod, number> & { total: number }
> {
  const rows = await prisma.ledgerEntry.groupBy({
    by: ["method", "direction"],
    where: { type: { not: "CAPITAL" } },
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

export type TripAmounts = {
  status: string;
  contractorPrice: number;
  driverDue: number;
  contractorPenalty?: number | null;
  driverPenalty?: number | null;
};

/**
 * المبالغ الفعلية للرحلة:
 * - رحلة عادية: سعر المقاول ومستحق السواق.
 * - رحلة ملغية: غرامة العميل ونصيب السواق منها (صفر في حالة السماح).
 */
export function effectiveAmounts(trip: TripAmounts) {
  if (trip.status === "CANCELLED") {
    return {
      contractor: trip.contractorPenalty ?? 0,
      driver: trip.driverPenalty ?? 0,
    };
  }
  return { contractor: trip.contractorPrice, driver: trip.driverDue };
}

export type TripLike = TripAmounts & {
  collections: { amount: number }[];
  driverPayments: { amount: number }[];
};

/** حسابات الرحلة الواحدة (تراعي الغرامة عند الإلغاء) */
export function tripFinancials(trip: TripLike) {
  const eff = effectiveAmounts(trip);
  const collected = trip.collections.reduce((a, c) => a + c.amount, 0);
  const remainingCollection = Math.max(eff.contractor - collected, 0);
  const paidToDriver = trip.driverPayments.reduce((a, p) => a + p.amount, 0);
  const remainingDriver = Math.max(eff.driver - paidToDriver, 0);
  const profit = eff.contractor - eff.driver;
  return {
    collected,
    remainingCollection,
    paidToDriver,
    remainingDriver,
    profit,
    effContractor: eff.contractor,
    effDriver: eff.driver,
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
