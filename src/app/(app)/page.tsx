import { AppHeader } from "@/components/layout/app-header";
import { StatCard } from "@/components/stat-card";
import { getDashboardStats } from "@/lib/dashboard";
import { treasuryByMethod } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { COMPANY_NAME } from "@/lib/constants";
import {
  CalendarDays,
  CalendarClock,
  Loader,
  AlertCircle,
  HandCoins,
  TrendingUp,
  Wallet,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, treasury] = await Promise.all([
    getDashboardStats(),
    treasuryByMethod(),
  ]);

  return (
    <>
      <AppHeader title={COMPANY_NAME} />
      <div className="space-y-5 py-3">
        {/* الخزنة */}
        <section className="rounded-2xl bg-gradient-to-br from-primary to-primary/70 p-5 text-primary-foreground shadow-lg shadow-primary/20">
          <div className="flex items-center gap-2 text-sm opacity-90">
            <Wallet className="h-4 w-4" />
            رصيد الخزنة الحالي
          </div>
          <div className="mt-1 text-3xl font-extrabold tabular-nums">
            {formatMoney(treasury.total)}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px]">
            <TreasuryPill label="كاش" value={treasury.cash} />
            <TreasuryPill label="إنستا" value={treasury.instapay} />
            <TreasuryPill label="محفظة" value={treasury.wallet} />
            <TreasuryPill label="فيزا" value={treasury.visa} />
          </div>
        </section>

        {/* الربح */}
        <section className="grid grid-cols-3 gap-3">
          <StatCard
            label="ربح اليوم"
            value={formatMoney(stats.profitToday, false)}
            tone={stats.profitToday >= 0 ? "success" : "destructive"}
            icon={TrendingUp}
          />
          <StatCard
            label="ربح الأسبوع"
            value={formatMoney(stats.profitWeek, false)}
            tone={stats.profitWeek >= 0 ? "success" : "destructive"}
            icon={TrendingUp}
          />
          <StatCard
            label="ربح الشهر"
            value={formatMoney(stats.profitMonth, false)}
            tone={stats.profitMonth >= 0 ? "success" : "destructive"}
            icon={TrendingUp}
          />
        </section>

        {/* الرحلات */}
        <section className="grid grid-cols-2 gap-3">
          <StatCard
            label="رحلات اليوم"
            value={stats.todayCount}
            icon={CalendarDays}
            tone="primary"
            href="/trips?filter=today"
          />
          <StatCard
            label="رحلات الغد"
            value={stats.tomorrowCount}
            icon={CalendarClock}
            href="/trips?filter=tomorrow"
          />
          <StatCard
            label="قيد التنفيذ"
            value={stats.inProgressCount}
            icon={Loader}
            tone="warning"
            href="/trips?status=IN_PROGRESS"
          />
          <StatCard
            label="عملاء متأخرون"
            value={stats.overdueContractorsCount}
            sub={formatMoney(stats.overdueAmount)}
            icon={AlertCircle}
            tone="destructive"
            href="/trips?collection=due"
          />
        </section>

        {/* مستحقات السواقين */}
        <StatCard
          label="سواقون مستحق لهم"
          value={`${stats.driversOwedCount} سواق`}
          sub={`إجمالي المتبقي: ${formatMoney(stats.driversOwedAmount)}`}
          icon={HandCoins}
          tone="warning"
          href="/drivers"
        />
      </div>
    </>
  );
}

function TreasuryPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white/15 px-1 py-1.5">
      <div className="opacity-90">{label}</div>
      <div className="font-bold tabular-nums">{formatMoney(value, false)}</div>
    </div>
  );
}
