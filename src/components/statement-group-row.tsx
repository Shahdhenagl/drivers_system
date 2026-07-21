"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { formatShortDate } from "@/lib/format";
import { StatementRowActions } from "@/components/statement-row-actions";
import type { StatementRow } from "@/components/party-print-statement";

/**
 * صف عملية مجمّعة في كشف الحساب: يعرض الدفعة بقيمتها الكاملة في سطر واحد،
 * وعند الضغط على «تفاصيل» يفتح السجلات الأصلية (توزيعها على الرحلات) بأزرارها.
 */
export function StatementGroupRow({
  row,
  members,
  delta,
  running,
}: {
  row: StatementRow;
  members: StatementRow[];
  delta: number;
  running: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr>
        <td className="whitespace-nowrap p-2 align-top text-muted-foreground">
          {formatShortDate(row.date)}
        </td>
        <td className="p-2">
          <div className="font-medium">{row.description}</div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            aria-expanded={open}
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
            />
            {open ? "إخفاء التفاصيل" : `تفاصيل (${members.length} رحلة)`}
          </button>
        </td>
        <td className="whitespace-nowrap p-2 align-top tabular-nums text-success">
          {delta > 0 ? formatMoney(delta, false) : "-"}
        </td>
        <td className="whitespace-nowrap p-2 align-top tabular-nums text-destructive">
          {delta < 0 ? formatMoney(-delta, false) : "-"}
        </td>
        <td
          className={`whitespace-nowrap p-2 align-top tabular-nums font-semibold ${
            running >= 0 ? "text-success" : "text-destructive"
          }`}
        >
          {running === 0
            ? formatMoney(0, false)
            : running > 0
              ? `${formatMoney(running, false)} له`
              : `${formatMoney(-running, false)} عليه`}
        </td>
        <td className="p-2 align-top print:hidden" />
      </tr>
      {open &&
        members.map((m) => {
          const d = (m.forParty ?? m.paid ?? 0) - (m.onParty ?? m.received ?? 0);
          return (
            <tr key={m.id} className="bg-muted/40 text-[11px]">
              <td className="whitespace-nowrap p-2 align-top text-muted-foreground">
                {formatShortDate(m.date)}
              </td>
              <td className="p-2 pr-5 text-muted-foreground">
                {m.details || m.description}
              </td>
              <td className="whitespace-nowrap p-2 align-top tabular-nums text-success">
                {d > 0 ? formatMoney(d, false) : "-"}
              </td>
              <td className="whitespace-nowrap p-2 align-top tabular-nums text-destructive">
                {d < 0 ? formatMoney(-d, false) : "-"}
              </td>
              <td />
              <td className="p-2 align-top print:hidden">
                <StatementRowActions action={m.action} />
              </td>
            </tr>
          );
        })}
    </>
  );
}
