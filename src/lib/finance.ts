import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  PAYMENT_METHOD_KEYS,
  type PaymentMethod,
  methodLabel,
} from "@/lib/constants";
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

/**
 * رصيد الخزنة الفعلي مقسّمًا حسب طريقة الدفع (يشمل رأس المال في الكاش).
 */
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

export type SpendEntry = { method: string; amount: number };
export type SpendResult =
  | { ok: true; entries: SpendEntry[] }
  | {
      ok: false;
      error: string;
      balances: Record<string, number>;
      spendable: Record<string, number>;
      canFallback: boolean;
    };

const FALLBACK_ORDER = ["cash", "wallet", "instapay", "visa"];

/**
 * يخطّط صرف مبلغ من وسيلة أساسية، مع منع النزول تحت الصفر (لا يوجد قفل لرأس المال).
 * لو allowFallback=true يغطّي الباقي من باقي الوسائل بالترتيب.
 * يُرجِع الخطة (قيود لكل وسيلة) أو فشلًا يحمل أرصدة الوسائل لعرضها.
 */
export async function planSpend(
  primary: string,
  amount: number,
  allowFallback = false
): Promise<SpendResult> {
  const treasury = await treasuryByMethod();
  const balances: Record<string, number> = {};
  for (const m of PAYMENT_METHOD_KEYS) balances[m] = treasury[m] ?? 0;

  const primAvail = balances[primary] ?? 0;

  if (amount <= primAvail) {
    return { ok: true, entries: [{ method: primary, amount }] };
  }

  if (allowFallback) {
    const order = [primary, ...FALLBACK_ORDER.filter((m) => m !== primary)];
    const entries: SpendEntry[] = [];
    let remaining = amount;
    for (const m of order) {
      if (remaining <= 0) break;
      const avail = balances[m] ?? 0;
      if (avail <= 0) continue;
      const take = Math.min(avail, remaining);
      entries.push({ method: m, amount: take });
      remaining -= take;
    }
    if (remaining <= 0) return { ok: true, entries };
  }

  const totalAvail = PAYMENT_METHOD_KEYS.reduce((a, m) => a + (balances[m] ?? 0), 0);
  return {
    ok: false,
    error: `الرصيد لا يكفي في ${methodLabel(primary)} — المتاح: ${formatMoney(primAvail)}`,
    balances,
    spendable: balances,
    // يمكن تغطية الباقي من وسائل أخرى فقط لو لم نكن قد جرّبنا ذلك بالفعل
    canFallback: !allowFallback && totalAvail >= amount,
  };
}

export type TripAmounts = {
  status: string;
  contractorPrice: number;
  driverDue: number;
  driverTip?: number | null; // اكرامية للسواق
  customerDiscount?: number | null; // خصم على العميل
  contractorPenalty?: number | null;
  driverPenalty?: number | null;
};

/**
 * المبالغ الفعلية للرحلة:
 * - رحلة عادية: سعر المقاول ناقص خصم العميل، ومستحق السواق زائد الاكرامية.
 * - رحلة ملغية: غرامة العميل ونصيب السواق منها (صفر في حالة السماح).
 */
export function effectiveAmounts(trip: TripAmounts) {
  if (trip.status === "CANCELLED") {
    return {
      contractor: trip.contractorPenalty ?? 0,
      driver: trip.driverPenalty ?? 0,
    };
  }
  return {
    contractor: trip.contractorPrice - (trip.customerDiscount ?? 0),
    driver: trip.driverDue + (trip.driverTip ?? 0),
  };
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
