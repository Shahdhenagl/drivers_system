import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { formatShortDate, cairoDayStr } from "@/lib/format";
import { methodLabel } from "@/lib/constants";

/**
 * سجل مالي مُجمَّع: يجمع الحركات (تحصيل/سداد) في سطر واحد لكل يوم + طريقة،
 * فيظهر "سداد 8000 — يوم كذا" بدل تفصيصها لكل رحلة.
 */
export function ConsolidatedLog({
  title,
  verb,
  items,
}: {
  title: string;
  verb: string; // "تحصيل" أو "سداد"
  items: { amount: number; method: string; date: Date }[];
}) {
  const groups = new Map<
    string,
    { date: Date; method: string; total: number; count: number }
  >();
  for (const it of items) {
    const key = `${cairoDayStr(it.date)}|${it.method}`;
    const g = groups.get(key) ?? { date: it.date, method: it.method, total: 0, count: 0 };
    g.total += it.amount;
    g.count += 1;
    groups.set(key, g);
  }
  const rows = [...groups.values()].sort(
    (a, b) => +new Date(b.date) - +new Date(a.date)
  );

  return (
    <section>
      <h2 className="mb-2 text-sm font-bold text-muted-foreground">
        {title} ({rows.length})
      </h2>
      <Card className="divide-y divide-border">
        {rows.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            لا توجد حركات
          </p>
        ) : (
          rows.map((g, i) => (
            <div key={i} className="flex items-center justify-between p-3 text-sm">
              <div className="font-medium text-success">
                {verb} {formatMoney(g.total)}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatShortDate(g.date)} • {methodLabel(g.method)}
                {g.count > 1 ? ` • ${g.count} عمليات` : ""}
              </div>
            </div>
          ))
        )}
      </Card>
    </section>
  );
}
