import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { PartnerForm } from "./partner-form";
import { DistributeForm } from "./distribute-form";
import { MonthFilter } from "@/components/month-filter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { getFinanceOverview } from "@/lib/finance-overview";
import { effectiveAmounts } from "@/lib/finance";
import { cairoMonthStr, monthBounds, monthLabel } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { Plus, Handshake, ChevronLeft, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const [partners, drivers, trips, expenses, ov] = await Promise.all([
    prisma.partner.findMany({
      orderBy: { createdAt: "asc" },
      include: { withdrawals: { select: { amount: true, date: true } } },
    }),
    prisma.driver.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.trip.findMany({
      select: {
        date: true,
        contractorPrice: true,
        driverDue: true,
        driverTip: true,
        customerDiscount: true,
        contractorSurcharge: true,
      },
    }),
    prisma.expense.findMany({ select: { date: true, amount: true } }),
    getFinanceOverview(),
  ]);

  const currentMonth = cairoMonthStr();
  const monthSet = new Set<string>([currentMonth]);
  for (const t of trips) monthSet.add(cairoMonthStr(t.date));
  for (const e of expenses) monthSet.add(cairoMonthStr(e.date));
  for (const p of partners) {
    for (const w of p.withdrawals) monthSet.add(cairoMonthStr(w.date));
  }
  const months = [...monthSet]
    .sort()
    .reverse()
    .map((value) => ({ value, label: monthLabel(value) }));
  const selectedMonth =
    m === "all"
      ? "all"
      : m && months.some((x) => x.value === m)
        ? m
        : currentMonth;
  const bounds = selectedMonth === "all" ? null : monthBounds(selectedMonth);
  const inPeriod = (date: Date) => !bounds || (date >= bounds[0] && date < bounds[1]);

  const periodTripProfit = bounds
    ? trips
        .filter((t) => inPeriod(t.date))
        .reduce((sum, t) => {
          const eff = effectiveAmounts(t);
          return sum + eff.contractor - eff.driver;
        }, 0)
    : ov.netProfit;
  const periodExpenses = bounds
    ? expenses.filter((e) => inPeriod(e.date)).reduce((sum, e) => sum + e.amount, 0)
    : 0;
  const periodNetProfit = bounds ? periodTripProfit - periodExpenses : ov.netProfit;

  const totalShare = partners.reduce((a, p) => a + p.sharePercent, 0);

  return (
    <>
      <AppHeader title="الشركاء" />
      <div className="space-y-4 py-3">
        <Link
          href="/more"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowRight className="h-4 w-4" /> رجوع
        </Link>

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            إجمالي النسب: <span className="font-bold">{totalShare}%</span>
          </div>
          <PartnerForm
            trigger={
              <Button size="sm">
                <Plus className="h-4 w-4" /> شريك
              </Button>
            }
          />
        </div>

        <MonthFilter months={months} selected={selectedMonth} />

        {partners.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <Handshake className="h-12 w-12 opacity-40" />
            <p>لا يوجد شركاء بعد</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {partners.map((p) => {
              const entitlement = Math.round(
                (periodNetProfit * p.sharePercent) / 100
              );
              const withdrawn = p.withdrawals
                .filter((w) => inPeriod(w.date))
                .reduce((a, w) => a + w.amount, 0);
              const balance = entitlement - withdrawn;
              return (
                <Link key={p.id} href={`/partners/${p.id}`}>
                  <Card className="flex items-center gap-3 p-3.5 transition-transform active:scale-[0.99]">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-500/15 font-bold text-blue-400">
                      {p.sharePercent}%
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        نصيبه: {formatMoney(entitlement)}
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="text-[10px] text-muted-foreground">الرصيد</div>
                      <div
                        className={`text-sm font-bold tabular-nums ${
                          balance >= 0 ? "text-success" : "text-destructive"
                        }`}
                      >
                        {formatMoney(balance, false)}
                      </div>
                    </div>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {partners.length > 0 && (
          <DistributeForm
            distributableProfit={ov.realizedProfit}
            partners={partners.map((p) => ({ id: p.id, name: p.name }))}
            drivers={drivers}
          />
        )}
      </div>
    </>
  );
}
