import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { formatShortDate } from "@/lib/format";
import type { StatementRow } from "@/components/party-print-statement";
import { StatementRowActions } from "@/components/statement-row-actions";
import { StatementGroupRow } from "@/components/statement-group-row";
import { groupStatementRows } from "@/lib/statement-group";

/**
 * كشف حساب مختصر على الشاشة: جدول (تاريخ • بيان • له • عليه • الرصيد الجاري)
 * مع فرق نهائي بين له وعليه. الرصيد الموجب = له (المكتب مدين له)، السالب = عليه.
 * الأرشفة (بدء حساب جديد) تُخفي الحركات الأقدم من تاريخ التصفير فقط — البيانات محفوظة.
 */
export function PartyStatement({
  title = "كشف الحساب",
  rows,
  clearedAt,
}: {
  title?: string;
  rows: StatementRow[];
  clearedAt?: Date | null;
}) {
  // الدفعة الواحدة المقسّمة داخليًا على رحلات تُعرض كحركة واحدة قابلة للفتح
  const sorted = groupStatementRows(rows).sort((a, b) => +a.date - +b.date);
  let running = 0;
  let totalFor = 0;
  let totalOn = 0;
  const computed = sorted.map((r) => {
    // له موجب، عليه سالب — عمود واحد يجمع الأثر ويتفادى ازدواج (عليه/استلم لنفس الحركة)
    const delta = (r.forParty ?? r.paid ?? 0) - (r.onParty ?? r.received ?? 0);
    running += delta;
    if (delta > 0) totalFor += delta;
    else if (delta < 0) totalOn += -delta;
    return { ...r, delta, running };
  });
  const net = running; // + = له، − = عليه

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-muted-foreground">
          {title} ({computed.length})
        </h2>
        {clearedAt && (
          <span className="text-[11px] text-muted-foreground">
            حساب جديد من {formatShortDate(clearedAt)}
          </span>
        )}
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-right text-xs">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">التاريخ</th>
                <th className="p-2 font-medium">البيان</th>
                <th className="p-2 font-medium text-success">له</th>
                <th className="p-2 font-medium text-destructive">عليه</th>
                <th className="p-2 font-medium">الرصيد</th>
                <th className="p-2 font-medium print:hidden">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {computed.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-muted-foreground">
                    لا توجد حركات في الحساب الحالي
                  </td>
                </tr>
              ) : (
                computed.map((r) =>
                  r.members && r.members.length > 1 ? (
                    <StatementGroupRow
                      key={r.id}
                      row={r}
                      members={r.members}
                      delta={r.delta}
                      running={r.running}
                    />
                  ) : (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap p-2 align-top text-muted-foreground">
                      {formatShortDate(r.date)}
                    </td>
                    <td className="p-2">
                      <div className="font-medium">{r.description}</div>
                      {r.details && (
                        <div className="text-[11px] text-muted-foreground">
                          {r.details}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap p-2 align-top tabular-nums text-success">
                      {r.delta > 0 ? formatMoney(r.delta, false) : "-"}
                    </td>
                    <td className="whitespace-nowrap p-2 align-top tabular-nums text-destructive">
                      {r.delta < 0 ? formatMoney(-r.delta, false) : "-"}
                    </td>
                    <td
                      className={`whitespace-nowrap p-2 align-top tabular-nums font-semibold ${
                        r.running >= 0 ? "text-success" : "text-destructive"
                      }`}
                    >
                      {r.running === 0
                        ? formatMoney(0, false)
                        : r.running > 0
                          ? `${formatMoney(r.running, false)} له`
                          : `${formatMoney(-r.running, false)} عليه`}
                    </td>
                    <td className="p-2 align-top print:hidden">
                      <StatementRowActions action={r.action} />
                    </td>
                  </tr>
                  )
                )
              )}
            </tbody>
            {computed.length > 0 && (
              <tfoot className="border-t-2 border-border bg-muted/40 font-bold">
                <tr>
                  <td className="p-2" colSpan={2}>
                    الفرق (له − عليه)
                  </td>
                  <td className="whitespace-nowrap p-2 tabular-nums text-success">
                    {formatMoney(totalFor, false)}
                  </td>
                  <td className="whitespace-nowrap p-2 tabular-nums text-destructive">
                    {formatMoney(totalOn, false)}
                  </td>
                  <td
                    className={`whitespace-nowrap p-2 tabular-nums ${
                      net >= 0 ? "text-success" : "text-destructive"
                    }`}
                  >
                    {net === 0
                      ? "متعادل"
                      : net > 0
                        ? `له ${formatMoney(net, false)}`
                        : `عليه ${formatMoney(-net, false)}`}
                  </td>
                  <td className="print:hidden" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </section>
  );
}
