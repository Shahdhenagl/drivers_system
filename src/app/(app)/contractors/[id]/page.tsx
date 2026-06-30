import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/print-button";
import { ContractorForm } from "../contractor-form";
import { DeleteContractorButton } from "../delete-contractor-button";
import { formatMoney } from "@/lib/money";
import { formatShortDate, startOfDay, endOfDay, addDays } from "@/lib/format";
import { displayPhone, whatsAppLink } from "@/lib/phone";
import { effectiveAmounts } from "@/lib/finance";
import { contractorReport } from "@/lib/messages";
import { methodLabel, TRIP_STATUS } from "@/lib/constants";
import {
  Phone,
  MessageCircle,
  Pencil,
  ChevronLeft,
  ArrowRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ContractorProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await prisma.contractor.findUnique({
    where: { id },
    include: {
      trips: {
        orderBy: { date: "desc" },
        include: {
          driver: { select: { name: true } },
          collections: true,
        },
      },
    },
  });
  if (!c) notFound();

  // تشمل الرحلات النشطة وغرامات الإلغاء (السماح = صفر)
  const totalRequired = c.trips.reduce(
    (a, t) => a + effectiveAmounts(t).contractor,
    0
  );
  const totalCollected = c.trips.reduce(
    (a, t) => a + t.collections.reduce((s, x) => s + x.amount, 0),
    0
  );
  const totalDeferred = Math.max(totalRequired - totalCollected, 0);
  const totalProfit = c.trips.reduce((a, t) => {
    const e = effectiveAmounts(t);
    return a + (e.contractor - e.driver);
  }, 0);

  const payments = c.trips
    .flatMap((t) =>
      t.collections.map((p) => ({
        ...p,
        route: `${t.startPoint} ← ${t.endPoint}`,
      }))
    )
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));

  // تقارير واتساب دورية
  const now = new Date();
  const reportPeriods = [
    { label: "أسبوعي", from: startOfDay(addDays(now, -6)), to: endOfDay(now) },
    { label: "شهري", from: startOfDay(addDays(now, -29)), to: endOfDay(now) },
  ];
  const reports = reportPeriods.map((p) => {
    const inP = c.trips.filter((t) => t.date >= p.from && t.date <= p.to);
    const total = inP.reduce((a, t) => a + effectiveAmounts(t).contractor, 0);
    const settled = inP.reduce(
      (a, t) => a + t.collections.reduce((s, x) => s + x.amount, 0),
      0
    );
    const msg = contractorReport({
      name: c.name,
      periodLabel: p.label,
      from: p.from,
      to: p.to,
      tripsCount: inP.length,
      total,
      settled,
      remainingTotal: totalDeferred,
    });
    return { label: p.label, href: whatsAppLink(c.phone, msg) };
  });

  return (
    <>
      <AppHeader title="ملف المقاول" />
      <div className="space-y-4 py-3 print:py-0">
        <Link
          href="/contractors"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground print:hidden"
        >
          <ArrowRight className="h-4 w-4" />
          رجوع للقائمة
        </Link>

        {/* الترويسة */}
        <Card className="space-y-3 p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary">
                {c.name.charAt(0)}
              </div>
              <div>
                <div className="text-lg font-bold">{c.name}</div>
                {c.company && (
                  <div className="text-sm text-muted-foreground">{c.company}</div>
                )}
                <div className="text-sm text-muted-foreground">
                  {displayPhone(c.phone)}
                </div>
                {c.altPhone && (
                  <div className="text-sm text-muted-foreground">
                    {displayPhone(c.altPhone)} (إضافي)
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-1 print:hidden">
              <ContractorForm
                contractor={c}
                trigger={
                  <Button variant="ghost" size="icon">
                    <Pencil className="h-4 w-4" />
                  </Button>
                }
              />
              <DeleteContractorButton id={c.id} />
            </div>
          </div>
          {c.notes && (
            <p className="rounded-lg bg-muted p-2 text-sm">{c.notes}</p>
          )}
          <div className="flex gap-2 print:hidden">
            <Button asChild variant="success" size="sm" className="flex-1">
              <a
                href={whatsAppLink(c.phone, `مرحبًا أ. ${c.name}`)}
                target="_blank"
              >
                <MessageCircle className="h-4 w-4" />
                واتساب
              </a>
            </Button>
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={`tel:${c.phone}`}>
                <Phone className="h-4 w-4" />
                اتصال
              </a>
            </Button>
            <PrintButton />
          </div>
        </Card>

        {/* الملخص المالي */}
        <div className="grid grid-cols-2 gap-3">
          <SummaryBox label="إجمالي المطلوب" value={totalRequired} />
          <SummaryBox label="إجمالي المحصّل" value={totalCollected} tone="success" />
          <SummaryBox label="إجمالي الآجل" value={totalDeferred} tone="destructive" />
          <SummaryBox label="أرباحنا منه" value={totalProfit} tone="primary" />
        </div>

        {/* تقرير واتساب دوري */}
        <Card className="space-y-2 p-4 print:hidden">
          <div className="text-sm font-bold text-muted-foreground">
            إرسال تقرير عبر واتساب
          </div>
          <div className="grid grid-cols-2 gap-2">
            {reports.map((r) => (
              <Button key={r.label} asChild variant="success" size="sm">
                <a href={r.href} target="_blank">
                  <MessageCircle className="h-4 w-4" /> تقرير {r.label}
                </a>
              </Button>
            ))}
          </div>
        </Card>

        {/* الرحلات */}
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">
            الرحلات ({c.trips.length})
          </h2>
          <div className="space-y-2">
            {c.trips.map((t) => {
              const collected = t.collections.reduce((s, x) => s + x.amount, 0);
              return (
                <Link key={t.id} href={`/trips/${t.id}`}>
                  <Card className="flex items-center justify-between p-3 active:scale-[0.99] transition-transform">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {t.startPoint} ← {t.endPoint}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatShortDate(t.date)}
                        {t.driver ? ` • ${t.driver.name}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-left">
                        <div className="text-sm font-bold tabular-nums">
                          {formatMoney(t.contractorPrice, false)}
                        </div>
                        <Badge className="bg-muted text-[10px] text-muted-foreground">
                          {TRIP_STATUS[t.status as keyof typeof TRIP_STATUS]}
                        </Badge>
                      </div>
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Card>
                </Link>
              );
            })}
            {c.trips.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                لا توجد رحلات
              </p>
            )}
          </div>
        </section>

        {/* سجل المدفوعات */}
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">
            سجل المدفوعات ({payments.length})
          </h2>
          <Card className="divide-y divide-border">
            {payments.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                لا توجد مدفوعات
              </p>
            ) : (
              payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 text-sm"
                >
                  <div>
                    <div className="font-medium">{formatMoney(p.amount)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatShortDate(p.date)} • {methodLabel(p.method)}
                    </div>
                  </div>
                  <div className="max-w-[45%] truncate text-xs text-muted-foreground">
                    {p.route}
                  </div>
                </div>
              ))
            )}
          </Card>
        </section>
      </div>
    </>
  );
}

function SummaryBox({
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
      <div className={`mt-1 text-lg font-bold tabular-nums ${color}`}>
        {formatMoney(value)}
      </div>
    </Card>
  );
}
