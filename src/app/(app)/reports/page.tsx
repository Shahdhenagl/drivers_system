import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrintButton } from "@/components/print-button";
import { prisma } from "@/lib/prisma";
import { getFinanceOverview } from "@/lib/finance-overview";
import { effectiveAmounts } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import {
  formatShortDate,
  startOfDay,
  endOfDay,
  cairoWeekStr,
  shiftWeek,
  weekBounds,
  weekOptionLabel,
} from "@/lib/format";
import { ArrowRight, Users, Truck, Handshake } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const ov = await getFinanceOverview();

  // اختصارات أسبوعية (السبت → الجمعة) لتقرير الفترة
  const currentWeek = cairoWeekStr();
  const weekShortcuts = Array.from({ length: 4 }, (_, i) => {
    const ws = shiftWeek(currentWeek, -i);
    const [start, end] = weekBounds(ws);
    const last = new Date(end.getTime() - 86_400_000);
    return {
      label: weekOptionLabel(ws, currentWeek),
      from: ws,
      to: last.toISOString().slice(0, 10),
    };
  });

  let custom: null | {
    from: string;
    to: string;
    trips: number;
    revenue: number;
    collected: number;
    driverDue: number;
    driverPaid: number;
    expenses: number;
    profit: number;
    net: number;
  } = null;

  if (from && to) {
    const gte = startOfDay(new Date(from));
    const lte = endOfDay(new Date(to));
    const [trips, collections, driverPayments, expenses] = await Promise.all([
      prisma.trip.findMany({
        where: { date: { gte, lte } },
        select: {
          contractorPrice: true,
          driverDue: true,
          driverTip: true,
          customerDiscount: true,
          contractorSurcharge: true,
        },
      }),
      prisma.collection.aggregate({
        where: { date: { gte, lte } },
        _sum: { amount: true },
      }),
      prisma.driverPayment.aggregate({
        where: { date: { gte, lte } },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: { date: { gte, lte } },
        _sum: { amount: true },
      }),
    ]);
    const revenue = trips.reduce(
      (a, t) => a + effectiveAmounts(t).contractor,
      0
    );
    const driverDue = trips.reduce((a, t) => a + effectiveAmounts(t).driver, 0);
    const exp = expenses._sum.amount ?? 0;
    const profit = revenue - driverDue;
    custom = {
      from,
      to,
      trips: trips.length,
      revenue,
      collected: collections._sum.amount ?? 0,
      driverDue,
      driverPaid: driverPayments._sum.amount ?? 0,
      expenses: exp,
      profit,
      net: profit - exp,
    };
  }

  return (
    <>
      <AppHeader title="التقارير" />
      <div className="space-y-5 py-3 print:py-0">
        <Link
          href="/more"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground print:hidden"
        >
          <ArrowRight className="h-4 w-4" /> رجوع
        </Link>

        {/* تقرير الماليات */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-muted-foreground">
              تقرير الماليات الإجمالي
            </h2>
            <PrintButton label="طباعة" />
          </div>
          <Card className="grid grid-cols-2 gap-3 p-4">
            <Row label="رأس المال" value={ov.capital} />
            <Row label="الإيرادات" value={ov.totalRevenue} />
            <Row label="المحصّل" value={ov.totalCollected} />
            <Row label="الآجل" value={ov.totalDeferred} />
            <Row label="مدفوع للسواقين" value={ov.totalPaidDrivers} />
            <Row label="متبقي للسواقين" value={ov.totalRemainingDrivers} />
            <Row label="المصروفات" value={ov.totalExpenses} />
            <Row label="إجمالي الربح" value={ov.grossProfit} />
            <div className="col-span-2 border-t border-border pt-2">
              <Row label="صافي الربح" value={ov.netProfit} strong />
            </div>
          </Card>
        </section>

        {/* تقرير مخصص بين تاريخين */}
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted-foreground print:hidden">
            تقرير مخصص بين تاريخين
          </h2>
          <Card className="space-y-3 p-4">
            {/* اختصارات أسبوعية — الأسبوع من السبت للجمعة */}
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 print:hidden">
              {weekShortcuts.map((s) => {
                const active = from === s.from && to === s.to;
                return (
                  <Link
                    key={s.from}
                    href={`/reports?from=${s.from}&to=${s.to}`}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {s.label}
                  </Link>
                );
              })}
            </div>

            <form className="flex flex-wrap items-end gap-3 print:hidden" method="get">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="from">من</Label>
                <Input id="from" name="from" type="date" defaultValue={from} required />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="to">إلى</Label>
                <Input id="to" name="to" type="date" defaultValue={to} required />
              </div>
              <Button type="submit">عرض</Button>
            </form>

            {custom && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">
                    من {formatShortDate(custom.from)} إلى{" "}
                    {formatShortDate(custom.to)}
                  </p>
                  <PrintButton label="PDF" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Row label="عدد الرحلات" value={custom.trips} raw />
                  <Row label="الإيرادات" value={custom.revenue} />
                  <Row label="المحصّل" value={custom.collected} />
                  <Row label="مستحق السواقين" value={custom.driverDue} />
                  <Row label="المدفوع للسواقين" value={custom.driverPaid} />
                  <Row label="المصروفات" value={custom.expenses} />
                  <Row label="إجمالي الربح" value={custom.profit} />
                  <Row label="صافي الربح" value={custom.net} strong />
                </div>
              </div>
            )}
          </Card>
        </section>

        {/* تقارير الأطراف */}
        <section className="print:hidden">
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">
            تقارير فردية (PDF من صفحة كل طرف)
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <ReportLink href="/contractors" label="المقاولين" icon={Users} />
            <ReportLink href="/drivers" label="السواقين" icon={Truck} />
            <ReportLink href="/partners" label="الشركاء" icon={Handshake} />
          </div>
        </section>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  strong,
  raw,
}: {
  label: string;
  value: number;
  strong?: boolean;
  raw?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`tabular-nums ${
          strong ? "text-base font-extrabold text-primary" : "font-bold"
        }`}
      >
        {raw ? value : formatMoney(value)}
      </span>
    </div>
  );
}

function ReportLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link href={href}>
      <Card className="flex flex-col items-center gap-2 p-4 text-center active:scale-[0.98] transition-transform">
        <Icon className="h-6 w-6 text-primary" />
        <span className="text-xs font-semibold">{label}</span>
      </Card>
    </Link>
  );
}
