import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import { PartnerForm } from "../partner-form";
import { WithdrawForm } from "../withdraw-form";
import { DeleteWithdrawalButton } from "../delete-withdrawal-button";
import { getFinanceOverview } from "@/lib/finance-overview";
import { getDashboardStats } from "@/lib/dashboard";
import { formatMoney } from "@/lib/money";
import { formatShortDate } from "@/lib/format";
import { displayPhone } from "@/lib/phone";
import { methodLabel } from "@/lib/constants";
import { Pencil, ArrowRight, Handshake } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PartnerProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [p, ov, stats] = await Promise.all([
    prisma.partner.findUnique({
      where: { id },
      include: { withdrawals: { orderBy: { date: "desc" } } },
    }),
    getFinanceOverview(),
    getDashboardStats(),
  ]);
  if (!p) notFound();

  const pct = p.sharePercent / 100;
  // نفس أساس سقف السحب في addWithdrawal: الربح المحصّل نقدًا لا الاستحقاق
  const entitlement = Math.round(ov.grossRealizedProfit * pct);
  const withdrawn = p.withdrawals.reduce((a, w) => a + w.amount, 0);
  const balance = entitlement - withdrawn;
  const weekShare = Math.round(stats.profitWeek * pct);
  const monthShare = Math.round(stats.profitMonth * pct);

  return (
    <>
      <AppHeader title="ملف الشريك" />
      <div className="space-y-4 py-3">
        <Link
          href="/partners"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground print:hidden"
        >
          <ArrowRight className="h-4 w-4" /> رجوع
        </Link>

        <Card className="space-y-3 p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/15 text-blue-400">
                <Handshake className="h-6 w-6" />
              </div>
              <div>
                <div className="text-lg font-bold">{p.name}</div>
                <div className="text-sm text-muted-foreground">
                  نسبة المشاركة: {p.sharePercent}%
                </div>
                {p.phone && (
                  <div className="text-sm text-muted-foreground">
                    {displayPhone(p.phone)}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-1 print:hidden">
              <PartnerForm
                partner={p}
                trigger={
                  <Button variant="ghost" size="icon">
                    <Pencil className="h-4 w-4" />
                  </Button>
                }
              />
            </div>
          </div>
          <div className="print:hidden">
            <PrintButton />
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <Box label="نصيبه من المحصّل" value={entitlement} />
          <Box label="السحوبات" value={withdrawn} tone="destructive" />
          <Box
            label="المتاح للسحب"
            value={balance}
            tone={balance >= 0 ? "success" : "destructive"}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Box label="نصيب الأسبوع (استحقاق)" value={weekShare} tone="primary" />
          <Box label="نصيب الشهر (استحقاق)" value={monthShare} tone="primary" />
        </div>
        <p className="text-xs text-muted-foreground">
          «المتاح للسحب» محسوب من الربح المحصّل نقدًا بعد خصم مستحقات السواقين
          والمصروفات. أنصبة الأسبوع/الشهر بالاستحقاق وتشمل رحلات لم تُحصَّل بعد.
        </p>

        <div className="print:hidden">
          <WithdrawForm partnerId={p.id} />
        </div>

        {/* السحوبات */}
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">
            سجل السحوبات ({p.withdrawals.length})
          </h2>
          <Card className="divide-y divide-border">
            {p.withdrawals.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                لا توجد سحوبات
              </p>
            ) : (
              p.withdrawals.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between gap-2 p-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-destructive">
                      {formatMoney(w.amount)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatShortDate(w.date)} •{" "}
                      {methodLabel(w.method)}
                    </div>
                    {w.note && (
                      <div className="truncate text-xs text-muted-foreground">
                        {w.note}
                      </div>
                    )}
                  </div>
                  <DeleteWithdrawalButton id={w.id} />
                </div>
              ))
            )}
          </Card>
        </section>
      </div>
    </>
  );
}

function Box({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "destructive" | "primary";
}) {
  const color = {
    default: "text-foreground",
    success: "text-success",
    destructive: "text-destructive",
    primary: "text-primary",
  }[tone];
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-base font-bold tabular-nums ${color}`}>
        {formatMoney(value)}
      </div>
    </Card>
  );
}
