import { formatShortDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { groupStatementRows } from "@/lib/statement-group";

/**
 * إجراء التعديل/الحذف المرتبط بصف كشف الحساب — يُبنى في الخادم ويُمرَّر لمكوّن
 * الأزرار في الواجهة، فيوجّه كل حركة لأكشن مصدرها (الذي يصحّح الخزنة والأرباح تلقائيًا).
 * الحركات المولّدة تلقائيًا (مقاصّة/عن طريق السواق/ربح شريك) تكون "locked" وتُدار من مصدرها.
 */
export type StatementRowAction =
  | { kind: "trip"; id: string }
  | { kind: "collection"; id: string; amount: number; method: string; note: string | null; date: Date }
  | { kind: "driverPayment"; id: string; amount: number; method: string; note: string | null; date: Date }
  | {
      kind: "advance";
      id: string;
      amount: number;
      direction: "OUT" | "IN";
      method: string;
      note: string | null;
      date: Date;
      isOpening: boolean;
    }
  | { kind: "adjustment"; id: string; amount: number; isProfit: boolean; note: string | null }
  | { kind: "external"; id: string }
  | { kind: "collectorHolding"; id: string }
  | { kind: "locked"; reason: string };

export type StatementRow = {
  id: string;
  date: Date;
  description: string;
  details?: string | null;
  forParty?: number;
  onParty?: number;
  paid?: number;
  received?: number;
  action?: StatementRowAction;
  /**
   * مفتاح تجميع: الصفوف الناتجة عن عملية واحدة (دفعة اتقسمت على رحلات) تحمل
   * نفس المفتاح فتُعرض كصف واحد. اتركه فارغًا للحركات المستقلة (الرحلات مثلًا).
   */
  groupKey?: string | null;
  /** وقت الإنشاء — يفصل بين عمليتين بنفس المفتاح في تاريخين/وقتين مختلفين */
  createdAt?: Date | null;
};

export function PartyPrintStatement({
  companyName,
  partyType,
  partyName,
  phone,
  periodLabel,
  generatedAt,
  summary,
  rows,
}: {
  companyName: string;
  partyType: string;
  partyName: string;
  phone?: string | null;
  periodLabel: string;
  generatedAt: Date;
  summary: {
    totalForParty: number;
    totalOnParty: number;
    totalPaid: number;
    totalReceived: number;
    netLabel: string;
    netAmount: number;
  };
  rows: StatementRow[];
}) {
  // الدفعة الواحدة المقسّمة على رحلات تُطبع كسطر واحد بقيمتها الكاملة
  const sortedRows = groupStatementRows(rows).sort((a, b) => +a.date - +b.date);
  // إجماليات الأعمدة — تُطبع في ذيل الجدول ليظهر مجموع «ليه» و«عليه» بوضوح
  const rowTotals = sortedRows.reduce(
    (acc, r) => ({
      forParty: acc.forParty + (r.forParty ?? 0),
      onParty: acc.onParty + (r.onParty ?? 0),
      paid: acc.paid + (r.paid ?? 0),
      received: acc.received + (r.received ?? 0),
    }),
    { forParty: 0, onParty: 0, paid: 0, received: 0 }
  );

  return (
    <section dir="rtl" className="hidden print:block">
      <div className="print-statement">
        <div className="print-statement__top">
          <div className="print-statement__title">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt={companyName} className="print-statement__logo" />
            <div>
              <div className="print-statement__brand">{companyName}</div>
              <div className="print-statement__subtitle">كشف حساب / فاتورة معاملات</div>
            </div>
          </div>
          <div className="print-statement__meta">
            <div>تاريخ الإصدار: {formatShortDate(generatedAt)}</div>
            <div>الفترة: {periodLabel}</div>
          </div>
        </div>

        <div className="print-statement__party">
          <div>
            <span>الحساب</span>
            <strong>{partyName}</strong>
          </div>
          <div>
            <span>النوع</span>
            <strong>{partyType}</strong>
          </div>
          {phone ? (
            <div>
              <span>الموبايل</span>
              <strong>{phone}</strong>
            </div>
          ) : null}
        </div>

        <div className="print-statement__summary">
          <SummaryCell label="إجمالي ليه" value={summary.totalForParty} />
          <SummaryCell label="إجمالي عليه" value={summary.totalOnParty} />
          <SummaryCell label="دفع" value={summary.totalPaid} />
          <SummaryCell label="استلم" value={summary.totalReceived} />
          <SummaryCell label={summary.netLabel} value={summary.netAmount} strong />
        </div>

        <div className="print-statement__section-title">حركات الحساب</div>
        <table className="print-statement__table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>البيان</th>
              <th>ليه</th>
              <th>عليه</th>
              <th>دفع</th>
              <th>استلم</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="print-statement__empty">
                  لا توجد معاملات في الفترة المحددة
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.id}>
                  <td>{formatShortDate(row.date)}</td>
                  <td>
                    <div className="print-statement__desc">{row.description}</div>
                    {row.details ? (
                      <div className="print-statement__details">{row.details}</div>
                    ) : null}
                  </td>
                  <MoneyCell value={row.forParty} />
                  <MoneyCell value={row.onParty} />
                  <MoneyCell value={row.paid} />
                  <MoneyCell value={row.received} />
                </tr>
              ))
            )}
          </tbody>
          {sortedRows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2}>
                  <strong>الإجمالي</strong>
                </td>
                <MoneyCell value={rowTotals.forParty} />
                <MoneyCell value={rowTotals.onParty} />
                <MoneyCell value={rowTotals.paid} />
                <MoneyCell value={rowTotals.received} />
              </tr>
            </tfoot>
          )}
        </table>

        <div className="print-statement__footer">
          <span>توقيع المستلم</span>
          <span>ختم {companyName}</span>
        </div>
      </div>
    </section>
  );
}

function SummaryCell({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className={strong ? "print-statement__summary-cell is-strong" : "print-statement__summary-cell"}>
      <span>{label}</span>
      <strong>{formatMoney(value)}</strong>
    </div>
  );
}

function MoneyCell({ value }: { value?: number }) {
  return <td className="print-statement__money">{value ? formatMoney(value, false) : "-"}</td>;
}
