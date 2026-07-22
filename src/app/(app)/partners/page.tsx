import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { PartnerForm } from "./partner-form";
import { DistributeForm } from "./distribute-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { getFinanceOverview } from "@/lib/finance-overview";
import { formatMoney } from "@/lib/money";
import { Plus, Handshake, ChevronLeft, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  const [partners, drivers, ov] = await Promise.all([
    prisma.partner.findMany({
      orderBy: { createdAt: "asc" },
      include: { withdrawals: { select: { amount: true } } },
    }),
    prisma.driver.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getFinanceOverview(),
  ]);

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

        <Card className="p-3.5">
          <div className="text-xs text-muted-foreground">
            ربح الرحلات المقفولة (أساس أنصبة الشركاء)
          </div>
          <div className="mt-1 text-lg font-bold tabular-nums text-success">
            {formatMoney(ov.grossRealizedProfit)}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            من {ov.closedTripsCount} رحلة مقفولة (اتحصّلت بالكامل واتسدّد سواقها)
            بربح {formatMoney(ov.closedTripsProfit, false)}
            {ov.totalExpenses > 0 && ` − مصروفات ${formatMoney(ov.totalExpenses, false)}`}
            {ov.totalDriverTips > 0 && ` − إكراميات ${formatMoney(ov.totalDriverTips, false)}`}
            . الرحلات الآجلة أو اللي سواقها لسه ما اتسدّدش مش داخلة.
          </p>
        </Card>

        {partners.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <Handshake className="h-12 w-12 opacity-40" />
            <p>لا يوجد شركاء بعد</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {partners.map((p) => {
              const entitlement = Math.round(
                (ov.grossRealizedProfit * p.sharePercent) / 100
              );
              const withdrawn = p.withdrawals.reduce((a, w) => a + w.amount, 0);
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
                      <div className="text-[10px] text-muted-foreground">
                        المتاح للسحب
                      </div>
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
