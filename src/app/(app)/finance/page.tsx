import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { ExpenseForm } from "./expense-form";
import { DeleteExpenseButton } from "./delete-expense-button";
import { prisma } from "@/lib/prisma";
import { treasuryByMethod } from "@/lib/finance";
import { getFinanceOverview } from "@/lib/finance-overview";
import { formatMoney } from "@/lib/money";
import { formatShortDate } from "@/lib/format";
import { PAYMENT_METHODS, LEDGER_TYPE } from "@/lib/constants";
import { Wallet, ArrowDownLeft, ArrowUpRight, Receipt } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const [treasury, ov, expenses, ledger] = await Promise.all([
    treasuryByMethod(),
    getFinanceOverview(),
    prisma.expense.findMany({ orderBy: { date: "desc" }, take: 30 }),
    prisma.ledgerEntry.findMany({ orderBy: { date: "desc" }, take: 50 }),
  ]);

  return (
    <>
      <AppHeader title="الماليات" />
      <div className="space-y-5 py-3">
        {/* الخزنة */}
        <section className="rounded-2xl bg-gradient-to-br from-primary to-primary/70 p-5 text-primary-foreground shadow-lg shadow-primary/20">
          <div className="flex items-center gap-2 text-sm opacity-90">
            <Wallet className="h-4 w-4" /> رصيد الخزنة
          </div>
          <div className="mt-1 text-3xl font-extrabold tabular-nums">
            {formatMoney(treasury.total)}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px]">
            {(["cash", "instapay", "wallet", "visa"] as const).map((m) => (
              <div key={m} className="rounded-lg bg-white/15 px-1 py-1.5">
                <div className="opacity-90">{PAYMENT_METHODS[m]}</div>
                <div className="font-bold tabular-nums">
                  {formatMoney(treasury[m], false)}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* المؤشرات */}
        <section className="grid grid-cols-2 gap-3">
          <Indicator label="رأس المال" value={ov.capital} />
          <Indicator label="إجمالي الإيرادات" value={ov.totalRevenue} />
          <Indicator label="إجمالي المحصّل" value={ov.totalCollected} tone="success" />
          <Indicator label="إجمالي الآجل" value={ov.totalDeferred} tone="destructive" />
          <Indicator label="مدفوع للسواقين" value={ov.totalPaidDrivers} />
          <Indicator label="متبقي للسواقين" value={ov.totalRemainingDrivers} tone="warning" />
          <Indicator label="إجمالي المصروفات" value={ov.totalExpenses} tone="destructive" />
          <Indicator label="إجمالي الربح" value={ov.grossProfit} tone="primary" />
          <Indicator
            label="إيراد الغرامات"
            value={ov.totalPenaltyRevenue}
            tone="primary"
          />
          <div className="col-span-2">
            <Card className="space-y-1 bg-primary/10 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">صافي الربح (بعد المصروفات)</span>
                <span className="text-xl font-extrabold tabular-nums text-primary">
                  {formatMoney(ov.netProfit)}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                المصروفات تُخصم من الربح فقط — رأس المال ({formatMoney(ov.capital, false)} ج.م) محفوظ.
              </p>
            </Card>
          </div>
        </section>

        {/* المصروفات */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-muted-foreground">المصروفات</h2>
            <ExpenseForm />
          </div>
          <Card className="divide-y divide-border">
            {expenses.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                لا توجد مصروفات
              </p>
            ) : (
              expenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
                      <Receipt className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="text-sm font-semibold">{e.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatShortDate(e.date)}
                        {e.category ? ` • ${e.category}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-destructive tabular-nums">
                      {formatMoney(e.amount, false)}
                    </span>
                    <DeleteExpenseButton id={e.id} />
                  </div>
                </div>
              ))
            )}
          </Card>
        </section>

        {/* دفتر الأستاذ */}
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">
            دفتر الأستاذ (آخر الحركات)
          </h2>
          <Card className="divide-y divide-border">
            {ledger.map((l) => {
              const isIn = l.direction === "IN";
              return (
                <div key={l.id} className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                        isIn ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {isIn ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {l.description}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatShortDate(l.date)} •{" "}
                        {LEDGER_TYPE[l.type as keyof typeof LEDGER_TYPE] ?? l.type}{" "}
                        • {PAYMENT_METHODS[l.method as keyof typeof PAYMENT_METHODS]}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-bold tabular-nums ${
                      isIn ? "text-success" : "text-destructive"
                    }`}
                  >
                    {isIn ? "+" : "−"}
                    {formatMoney(l.amount, false)}
                  </span>
                </div>
              );
            })}
          </Card>
        </section>
      </div>
    </>
  );
}

function Indicator({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "destructive" | "warning" | "primary";
}) {
  const color = {
    default: "text-foreground",
    success: "text-success",
    destructive: "text-destructive",
    warning: "text-warning",
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
