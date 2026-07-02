import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppHeader } from "@/components/layout/app-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/print-button";
import { DriverForm } from "../driver-form";
import { DeleteDriverButton } from "../delete-driver-button";
import { PayDriverForm } from "../pay-driver-form";
import { AdvancePanel } from "@/components/advance-panel";
import { formatMoney } from "@/lib/money";
import { formatShortDate, startOfDay, endOfDay, addDays } from "@/lib/format";
import { displayPhone } from "@/lib/phone";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { effectiveAmounts } from "@/lib/finance";
import { driverReport } from "@/lib/messages";
import { methodLabel, TRIP_STATUS } from "@/lib/constants";
import {
  Phone,
  MessageCircle,
  Pencil,
  ChevronLeft,
  ArrowRight,
  Truck,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DriverProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const d = await prisma.driver.findUnique({
    where: { id },
    include: {
      trips: {
        orderBy: { date: "desc" },
        include: {
          contractor: { select: { name: true } },
          driverPayments: true,
        },
      },
      payments: { orderBy: { date: "desc" } },
    },
  });
  if (!d) notFound();

  // السلف/الأرصدة تُجلب منفصلة ومرنة (لو الجدول غير موجود بعد قبل الترحيل)
  const advances = await prisma.advance
    .findMany({
      where: { partyType: "DRIVER", partyId: id },
      orderBy: { date: "desc" },
    })
    .catch(
      () =>
        [] as {
          id: string;
          amount: number;
          direction: string;
          method: string;
          note: string | null;
          isOpening: boolean;
          date: Date;
        }[]
    );

  // تشمل الرحلات النشطة ونصيب السواق من غرامات الإلغاء
  const totalDue = d.trips.reduce((a, t) => a + effectiveAmounts(t).driver, 0);
  const totalPaid = d.payments.reduce((a, p) => a + p.amount, 0);
  const remaining = Math.max(totalDue - totalPaid, 0);

  // رصيد السلف: OUT − IN (موجب = عليه لنا، سالب = لنا عليه)
  const advOut = advances
    .filter((a) => a.direction === "OUT")
    .reduce((s, a) => s + a.amount, 0);
  const advIn = advances
    .filter((a) => a.direction === "IN")
    .reduce((s, a) => s + a.amount, 0);
  const advanceBalance = advOut - advIn;
  const advanceOutstanding = Math.max(advanceBalance, 0);

  // تقارير واتساب دورية
  const now = new Date();
  const reportPeriods = [
    { label: "أسبوعي", from: startOfDay(addDays(now, -6)), to: endOfDay(now) },
    { label: "شهري", from: startOfDay(addDays(now, -29)), to: endOfDay(now) },
  ];
  const reports = reportPeriods.map((p) => {
    const inP = d.trips.filter((t) => t.date >= p.from && t.date <= p.to);
    const total = inP.reduce((a, t) => a + effectiveAmounts(t).driver, 0);
    const settled = inP.reduce(
      (a, t) => a + t.driverPayments.reduce((s, x) => s + x.amount, 0),
      0
    );
    const msg = driverReport({
      name: d.name,
      periodLabel: p.label,
      from: p.from,
      to: p.to,
      trips: inP.map((t) => ({
        date: t.date,
        startPoint: t.startPoint,
        endPoint: t.endPoint,
        driverDue: effectiveAmounts(t).driver,
        paid: t.driverPayments.reduce((s, x) => s + x.amount, 0),
      })),
      total,
      settled,
      remainingTotal: remaining,
      advanceOutstanding,
    });
    return { label: p.label, message: msg };
  });

  return (
    <>
      <AppHeader title="ملف السواق" />
      <div className="space-y-4 py-3">
        <Link
          href="/drivers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground print:hidden"
        >
          <ArrowRight className="h-4 w-4" />
          رجوع للقائمة
        </Link>

        <Card className="space-y-3 p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
                <Truck className="h-6 w-6" />
              </div>
              <div>
                <div className="text-lg font-bold">{d.name}</div>
                <div className="text-sm text-muted-foreground">
                  {d.vehicleType}
                  {d.vehicleNumber ? ` • ${d.vehicleNumber}` : ""}
                </div>
                <div className="text-sm text-muted-foreground">
                  {displayPhone(d.phone)}
                </div>
                {d.altPhone && (
                  <div className="text-sm text-muted-foreground">
                    {displayPhone(d.altPhone)} (إضافي)
                  </div>
                )}
                {d.phone3 && (
                  <div className="text-sm text-muted-foreground">
                    {displayPhone(d.phone3)} (إضافي)
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-1 print:hidden">
              <DriverForm
                driver={d}
                trigger={
                  <Button variant="ghost" size="icon">
                    <Pencil className="h-4 w-4" />
                  </Button>
                }
              />
              <DeleteDriverButton id={d.id} />
            </div>
          </div>
          {d.notes && <p className="rounded-lg bg-muted p-2 text-sm">{d.notes}</p>}
          <div className="flex gap-2 print:hidden">
            <WhatsAppButton
              phone={d.phone}
              message={`مرحبًا ${d.name}`}
              variant="success"
              size="sm"
              className="flex-1"
            >
              <MessageCircle className="h-4 w-4" />
              واتساب
            </WhatsAppButton>
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={`tel:${d.phone}`}>
                <Phone className="h-4 w-4" />
                اتصال
              </a>
            </Button>
            <PrintButton />
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <SummaryBox label="إجمالي المستحق" value={totalDue} />
          <SummaryBox label="المدفوع" value={totalPaid} tone="success" />
          <SummaryBox label="المتبقي" value={remaining} tone="warning" />
        </div>

        <div className="print:hidden">
          <PayDriverForm
            driverId={d.id}
            remaining={remaining}
            advanceBalance={advanceBalance}
          />
        </div>

        {/* السلف والأرصدة */}
        <AdvancePanel
          partyType="DRIVER"
          partyId={d.id}
          name={d.name}
          phone={d.phone}
          balance={advanceBalance}
          advances={advances}
        />

        {/* تقرير واتساب دوري */}
        <Card className="space-y-2 p-4 print:hidden">
          <div className="text-sm font-bold text-muted-foreground">
            إرسال تقرير عبر واتساب
          </div>
          <div className="grid grid-cols-2 gap-2">
            {reports.map((r) => (
              <WhatsAppButton
                key={r.label}
                phone={d.phone}
                message={r.message}
                variant="success"
                size="sm"
              >
                <MessageCircle className="h-4 w-4" /> تقرير {r.label}
              </WhatsAppButton>
            ))}
          </div>
        </Card>

        {/* الرحلات */}
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">
            الرحلات ({d.trips.length})
          </h2>
          <div className="space-y-2">
            {d.trips.map((t) => (
              <Link key={t.id} href={`/trips/${t.id}`}>
                <Card className="flex items-center justify-between p-3 active:scale-[0.99] transition-transform">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {t.startPoint} ← {t.endPoint}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatShortDate(t.date)} • {t.contractor.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-left">
                      <div className="text-sm font-bold tabular-nums text-warning">
                        {formatMoney(t.driverDue, false)}
                      </div>
                      <Badge className="bg-muted text-[10px] text-muted-foreground">
                        {TRIP_STATUS[t.status as keyof typeof TRIP_STATUS]}
                      </Badge>
                    </div>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Card>
              </Link>
            ))}
            {d.trips.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                لا توجد رحلات
              </p>
            )}
          </div>
        </section>

        {/* سجل السداد */}
        <section>
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">
            سجل السداد ({d.payments.length})
          </h2>
          <Card className="divide-y divide-border">
            {d.payments.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                لا توجد عمليات سداد
              </p>
            ) : (
              d.payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 text-sm"
                >
                  <div>
                    <div className="font-medium text-success">
                      {formatMoney(p.amount)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatShortDate(p.date)} • {methodLabel(p.method)}
                    </div>
                  </div>
                  {p.note && (
                    <div className="max-w-[45%] truncate text-xs text-muted-foreground">
                      {p.note}
                    </div>
                  )}
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
  tone?: "default" | "success" | "warning";
}) {
  const color = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
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
