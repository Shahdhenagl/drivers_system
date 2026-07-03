import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";

export function AccountTotalSummary({
  title = "الحساب الشامل",
  forParty,
  onParty,
  rows,
}: {
  title?: string;
  forParty: number;
  onParty: number;
  rows: { label: string; value: number; side: "for" | "on" }[];
}) {
  const netForParty = forParty - onParty;
  const isForParty = netForParty > 0;
  const isOnParty = netForParty < 0;

  return (
    <Card className="space-y-3 p-4">
      <div className="text-sm font-bold text-muted-foreground">{title}</div>
      <div
        className={`rounded-lg p-3 text-center ${
          isForParty
            ? "bg-destructive/10 text-destructive"
            : isOnParty
              ? "bg-success/10 text-success"
              : "bg-muted text-muted-foreground"
        }`}
      >
        <div className="text-xs font-medium">
          {isForParty ? "له صافي" : isOnParty ? "عليه صافي" : "الحساب متعادل"}
        </div>
        <div className="mt-1 text-xl font-extrabold tabular-nums">
          {formatMoney(Math.abs(netForParty))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-destructive/10 p-2">
          <div className="text-[11px] text-muted-foreground">إجمالي له</div>
          <div className="font-bold text-destructive">{formatMoney(forParty)}</div>
        </div>
        <div className="rounded-lg bg-success/10 p-2">
          <div className="text-[11px] text-muted-foreground">إجمالي عليه</div>
          <div className="font-bold text-success">{formatMoney(onParty)}</div>
        </div>
      </div>
      <div className="space-y-1 rounded-lg bg-muted/60 p-2 text-xs">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-muted-foreground">{row.label}</span>
            <span
              className={
                row.side === "for"
                  ? "font-semibold text-destructive"
                  : "font-semibold text-success"
              }
            >
              {formatMoney(row.value)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
