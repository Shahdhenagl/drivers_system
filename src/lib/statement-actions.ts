import type { StatementRowAction } from "@/components/party-print-statement";
import { EXTRA_PROFIT_METHOD, TIP_METHOD, isSystemAdvanceMethod } from "@/lib/constants";

type AdvanceLike = {
  id: string;
  amount: number;
  direction: string;
  method: string;
  note: string | null;
  isOpening: boolean;
  date: Date;
};

/**
 * تصنيف حركة سلفة/رصيد إلى إجراء كشف الحساب المناسب:
 * ربح إضافي/إكرامية → تعديل تسوية، الحركات المولّدة تلقائيًا → مقفولة (تُدار من مصدرها)،
 * وغيرها → سلفة قابلة للتعديل/الحذف مباشرة.
 */
export function advanceRowAction(a: AdvanceLike): StatementRowAction {
  if (a.method === EXTRA_PROFIT_METHOD || a.method === TIP_METHOD) {
    return {
      kind: "adjustment",
      id: a.id,
      amount: a.amount,
      isProfit: a.method === EXTRA_PROFIT_METHOD,
      note: a.note,
    };
  }
  if (isSystemAdvanceMethod(a.method)) {
    return {
      kind: "locked",
      reason:
        "حركة مرتبطة بعملية أخرى (مقاصّة/تحصيل عن طريق طرف) — تُعدَّل أو تُحذف من مصدرها",
    };
  }
  return {
    kind: "advance",
    id: a.id,
    amount: a.amount,
    direction: a.direction === "IN" ? "IN" : "OUT",
    method: a.method,
    note: a.note,
    date: a.date,
    isOpening: a.isOpening,
  };
}
