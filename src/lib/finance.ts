import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { PAYMENT_METHOD_KEYS, type PaymentMethod } from "@/lib/constants";
import { formatMoney } from "@/lib/money";

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

/** رأس المال المحجوز في الكاش (لا يجوز الصرف منه) — بالقروش */
export async function cashFloor(): Promise<number> {
  const s = await prisma.setting.findUnique({
    where: { key: "initial_capital" },
  });
  return s ? Number(s.value) : 0;
}

/**
 * أقصى مبلغ يمكن صرفه من طريقة دفع مع الحفاظ على رأس المال.
 * الكاش: الرصيد ناقص رأس المال. باقي الطرق: الرصيد كاملًا.
 */
export async function spendableInMethod(method: string): Promise<number> {
  const available = await availableInMethod(method);
  if (method === "cash") {
    return Math.max(available - (await cashFloor()), 0);
  }
  return available;
}

/**
 * يتأكد أن المبلغ قابل للصرف من طريقة الدفع دون المساس برأس المال،
 * ويرمي خطأً واضحًا إن تجاوز المتاح.
 */
export async function assertSpendable(method: string, amount: number) {
  const spendable = await spendableInMethod(method);
  if (amount > spendable) {
    const floor = method === "cash" ? await cashFloor() : 0;
    throw new Error(
      floor > 0
        ? `المبلغ يتجاوز المتاح للصرف. رأس المال (${formatMoney(floor)}) محفوظ في الكاش — المتاح للصرف الآن: ${formatMoney(spendable)}`
        : `المبلغ أكبر من رصيد الخزنة في طريقة الدفع — المتاح: ${formatMoney(spendable)}`
    );
  }
}

/**
 * يتأكد أن المبلغ ضمن رصيد الخزنة الفعلي (دون اعتبار رأس المال).
 * يُستخدم للالتزامات مثل سداد السواق — لا يُحجب بقفل رأس المال.
 */
export async function assertAvailable(method: string, amount: number) {
  const available = await availableInMethod(method);
  if (amount > available) {
    throw new Error(
      `المبلغ أكبر من رصيد الخزنة في طريقة الدفع — المتاح: ${formatMoney(available)}`
    );
  }
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
