import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { WeekFilter } from "@/components/week-filter";
import { PrintButton } from "@/components/print-button";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { effectiveAmounts } from "@/lib/finance";
import { weekBoundsUTC, formatShortDate } from "@/lib/format";
import { Users, Truck, ChevronLeft, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function WeeklyClosingPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const { w } = await searchParams;
  const offset = Number.parseInt(w ?? "0", 10);
  const selected = Number.isNaN(offset) || offset > 0 || offset < -25 ? 0 : offset;

  // خيارات الأسابيع (الحالي + 7 سابقة)
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const off = -i;
    const [from, to] = weekBoundsUTC(off);
    const last = new Date(to.getTime() - 86_400_000);
    const range = `${formatShortDate(from)} → ${formatShortDate(last)}`;
    const prefix = off === 0 ? "هذا الأسبوع • " : off === -1 ? "الأسبوع السابق • " : "";
    return { value: String(off), label: `${prefix}${range}` };
  });

  const [from, to] = weekBoundsUTC(selected);
  const lastDay = new Date(to.getTime() - 86_400_000);

  const trips = await prisma.trip.findMany({
    where: { date: { gte: from, lt: to } },
    include: {
      contractor: { select: { id: true, name: true } },
      driver: { select: { id: true, name: true } },
      collections: { select: { amount: true } },
      driverPayments: { select: { amount: true } },
    },
  });

  type Row = { id: string; name: string; gross: number; settled: number };
  const cMap = new Map<string, Row>();
  const dMap = new Map<string, Row>();
  for (const t of trips) {
    const eff = effectiveAmounts(t);
    const c = cMap.get(t.contractorId) ?? { id: t.contractorId, name: t.contractor.name, gross: 0, settled: 0 };
    c.gross += eff.contractor;
    c.settled += t.collections.reduce((s, x) => s + x.amount, 0);
    cMap.set(t.contractorId, c);
    if (t.driver && t.driverId) {
      const d = dMap.get(t.driverId) ?? { id: t.driverId, name: t.driver.name, gross: 0, settled: 0 };
      d.gross += eff.driver;
      d.settled += t.driverPayments.reduce((s, x) => s + x.amount, 0);
      dMap.set(t.driverId, d);
    }
  }
  const contractors = [...cMap.values()]
    .filter((r) => r.gross > 0)
    .sort((a, b) => b.gross - a.gross);
  const drivers = [...dMap.values()]
    .filter((r) => r.gross > 0)
    .sort((a, b) => b.gross - a.gross);

  const totalFromContractors = contractors.reduce((a, r) => a + Math.max(r.gross - r.settled, 0), 0);
  const totalToDrivers = drivers.reduce((a, r) => a + Math.max(r.gross - r.settled, 0), 0);
  const weekProfit =
    contractors.reduce((a, r) => a + r.gross, 0) - drivers.reduce((a, r) => a + r.gross, 0);

  return (
    <>
      <AppHeader title="تصفية أسبوعية" />
      <div className="space-y-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <WeekFilter weeks={weeks} selected={String(selected)} />
          <PrintButton />
        </div>

        <div className="text-center text-xs text-muted-foreground">
          الأسبوع من {formatShortDate(from)} إلى {formatShortDate(lastDay)} (السبت →
          الجمعة)
        </div>

        {/* ملخص الأسبوع */}
        <div className="grid grid-cols-3 gap-3">
          <SummaryBox label="مستحق من المقاولين" value={totalFromContractors} tone="destructive" />
          <SummaryBox label="مستحق للسواقين" value={totalToDrivers} tone="warning" />
          <SummaryBox label="ربح الأسبوع" value={weekProfit} tone="primary" />
        </div>

        {/* المقاولين */}
        <Section
          icon={<Users className="h-4 w-4" />}
          title={`المقاولين (${contractors.length})`}
          rows={contractors}
          hrefBase="/contractors"
          sideLabel="منه"
          sideTone="text-destructive"
          emptyText="لا توجد حركة مقاولين هذا الأسبوع"
        />

        {/* السواقين */}
        <Section
          icon={<Truck className="h-4 w-4" />}
          title={`السواقين (${drivers.length})`}
          rows={drivers}
          hrefBase="/drivers"
          sideLabel="له"
          sideTone="text-warning"
          emptyText="لا توجد حركة سواقين هذا الأسبوع"
        />
      </div>
    </>
  );
}

function Section({
  icon,
  title,
  rows,
  hrefBase,
  sideLabel,
  sideTone,
  emptyText,
}: {
  icon: React.ReactNode;
  title: string;
  rows: { id: string; name: string; gross: number; settled: number }[];
  hrefBase: string;
  sideLabel: string;
  sideTone: string;
  emptyText: string;
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
        {icon} {title}
      </h2>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const remaining = Math.max(r.gross - r.settled, 0);
            const done = remaining <= 0;
            return (
              <Link key={r.id} href={`${hrefBase}/${r.id}`}>
                <Card className="flex items-center justify-between gap-2 p-3 active:scale-[0.99] transition-transform">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      إجمالي الأسبوع {formatMoney(r.gross, false)} • مسدَّد{" "}
                      {formatMoney(r.settled, false)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {done ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-success">
                        <CheckCircle2 className="h-4 w-4" /> مُصفّى
                      </span>
                    ) : (
                      <div className="text-left">
                        <div className="text-[10px] text-muted-foreground">{sideLabel}</div>
                        <div className={`text-sm font-bold tabular-nums ${sideTone}`}>
                          {formatMoney(remaining, false)}
                        </div>
                      </div>
                    )}
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SummaryBox({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "destructive" | "warning" | "primary";
}) {
  const color = {
    default: "text-foreground",
    destructive: "text-destructive",
    warning: "text-warning",
    primary: "text-primary",
  }[tone];
  return (
    <Card className="p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-sm font-bold tabular-nums ${color}`}>
        {formatMoney(value, false)}
      </div>
    </Card>
  );
}
