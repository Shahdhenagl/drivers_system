import { formatShortDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export type StatementRow = {
  id: string;
  date: Date;
  description: string;
  details?: string | null;
  forParty?: number;
  onParty?: number;
  paid?: number;
  received?: number;
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
  const sortedRows = [...rows].sort((a, b) => +a.date - +b.date);

  return (
    <section dir="rtl" className="hidden print:block">
      <div className="print-statement">
        <div className="print-statement__top">
          <div>
            <div className="print-statement__brand">{companyName}</div>
            <div className="print-statement__subtitle">كشف حساب / فاتورة معاملات</div>
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
