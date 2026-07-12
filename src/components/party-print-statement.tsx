import { formatShortDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";

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
};

/** رحلة في جدول تفاصيل الرحلات بكشف الحساب المطبوع */
export type PrintTrip = {
  id: string;
  date: Date;
  startPoint: string;
  endPoint: string;
  vehicleType?: string | null;
  /** الطرف المقابل: اسم السواق في ملف المقاول، واسم المقاول في ملف السواق */
  counterparty?: string | null;
  contractorPrice: number;
  driverDue: number;
  statusLabel?: string;
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
  trips,
  counterpartyLabel,
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
  trips?: PrintTrip[];
  counterpartyLabel?: string;
}) {
  const sortedRows = [...rows].sort((a, b) => +a.date - +b.date);
  const sortedTrips = [...(trips ?? [])].sort((a, b) => +a.date - +b.date);
  const tripTotals = sortedTrips.reduce(
    (acc, t) => ({
      contractorPrice: acc.contractorPrice + t.contractorPrice,
      driverDue: acc.driverDue + t.driverDue,
    }),
    { contractorPrice: 0, driverDue: 0 }
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

        {trips && (
          <>
            <div className="print-statement__section-title">
              تفاصيل الرحلات ({sortedTrips.length})
            </div>
            <table className="print-statement__table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>الرحلة</th>
                  <th>نوع العربية</th>
                  {counterpartyLabel ? <th>{counterpartyLabel}</th> : null}
                  <th>سعر المقاول</th>
                  <th>مستحق السواق</th>
                </tr>
              </thead>
              <tbody>
                {sortedTrips.length === 0 ? (
                  <tr>
                    <td colSpan={counterpartyLabel ? 6 : 5} className="print-statement__empty">
                      لا توجد رحلات في الفترة المحددة
                    </td>
                  </tr>
                ) : (
                  sortedTrips.map((t) => (
                    <tr key={t.id}>
                      <td>{formatShortDate(t.date)}</td>
                      <td>
                        <div className="print-statement__desc">
                          {t.startPoint} ← {t.endPoint}
                        </div>
                        {t.statusLabel ? (
                          <div className="print-statement__details">{t.statusLabel}</div>
                        ) : null}
                      </td>
                      <td>{t.vehicleType || "-"}</td>
                      {counterpartyLabel ? <td>{t.counterparty || "-"}</td> : null}
                      <MoneyCell value={t.contractorPrice} />
                      <MoneyCell value={t.driverDue} />
                    </tr>
                  ))
                )}
              </tbody>
              {sortedTrips.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={counterpartyLabel ? 4 : 3}>
                      <strong>الإجمالي</strong>
                    </td>
                    <MoneyCell value={tripTotals.contractorPrice} />
                    <MoneyCell value={tripTotals.driverDue} />
                  </tr>
                </tfoot>
              )}
            </table>
          </>
        )}

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
